import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import app from '../src/app.mjs'
import { connectDatabase, isDatabaseConnected } from '../src/config/database.mjs'
import { env } from '../src/config/env.mjs'
import { signToken } from '../src/middleware/auth.mjs'
import Department from '../src/models/Department.mjs'
import Demerit from '../src/models/Demerit.mjs'
import StaffTask from '../src/models/StaffTask.mjs'
import User from '../src/models/User.mjs'
import { resolveStaffPerformanceRange } from '../src/services/staffPerformanceService.mjs'

const runId = `${process.pid}-${Date.now()}`
const users = []
const tasks = []
const demerits = []
let department
let server
let baseUrl
let adminToken
let restrictedAdminToken
let nonAdminToken
let officer
let verifier
let applicant

before(async () => {
  assert.ok(env.MONGODB_URI, 'MONGODB_URI must be configured for staff performance integration tests.')
  await connectDatabase()
  assert.equal(isDatabaseConnected(), true, 'MongoDB must be reachable for staff performance tests.')

  department = await Department.create({
    name: `Staff performance department ${runId}`,
    code: `SP-${runId}`,
    isActive: true,
  })
  const createdUsers = await User.create([
    {
      email: `performance-officer-${runId}@example.test`,
      displayName: 'Performance Officer',
      role: 'OFFICER',
      departmentId: String(department._id),
      accountStatus: 'ACTIVE',
      permissions: ['APPLICATION_VIEW_ASSIGNED'],
    },
    {
      email: `performance-verifier-${runId}@example.test`,
      displayName: 'Performance Verifier',
      role: 'HUMAN_VERIFIER',
      departmentId: String(department._id),
      accountStatus: 'ACTIVE',
      permissions: ['HUMAN_VERIFY_OCR'],
    },
    {
      email: `performance-applicant-${runId}@example.test`,
      displayName: 'Performance Applicant',
      role: 'APPLICANT',
      permissions: ['APPLICATION_CREATE'],
    },
    {
      email: `performance-admin-${runId}@example.test`,
      displayName: 'Performance Admin',
      role: 'ADMIN',
      permissions: ['USER_MANAGE'],
    },
    {
      email: `performance-restricted-admin-${runId}@example.test`,
      displayName: 'Restricted Admin',
      role: 'ADMIN',
      permissions: [],
    },
  ])
  ;[officer, verifier, applicant] = createdUsers
  users.push(...createdUsers)
  const admin = await User.findOne({ email: `performance-admin-${runId}@example.test` }).lean()
  const restrictedAdmin = await User.findOne({ email: `performance-restricted-admin-${runId}@example.test` }).lean()
  adminToken = signToken({ id: String(admin._id), role: admin.role, permissions: admin.permissions })
  restrictedAdminToken = signToken({
    id: String(restrictedAdmin._id),
    role: restrictedAdmin.role,
    permissions: restrictedAdmin.permissions,
  })
  nonAdminToken = signToken({ id: String(applicant._id), role: applicant.role, permissions: applicant.permissions })

  const now = Date.now()
  const assignedTwoDaysAgo = new Date(now - 2 * 86_400_000)
  const dueAfterFiveDays = (assignedAt) => new Date(assignedAt.getTime() + 5 * 86_400_000)
  const records = await StaffTask.create([
    {
      taskType: 'OFFICER_APPLICATION',
      applicationId: new mongoose.Types.ObjectId(),
      staffId: officer._id,
      staffRole: 'OFFICER',
      assignedAt: assignedTwoDaysAgo,
      dueAt: dueAfterFiveDays(assignedTwoDaysAgo),
      completedAt: new Date(assignedTwoDaysAgo.getTime() + 86_400_000),
      status: 'COMPLETED',
    },
    {
      taskType: 'HUMAN_VERIFICATION_APPLICATION',
      applicationId: new mongoose.Types.ObjectId(),
      staffId: verifier._id,
      staffRole: 'HUMAN_VERIFIER',
      assignedAt: new Date(now - 8 * 86_400_000),
      dueAt: new Date(now - 3 * 86_400_000),
      completedAt: new Date(now - 2 * 86_400_000),
      status: 'COMPLETED_OVERDUE',
    },
    {
      taskType: 'OFFICER_APPLICATION',
      applicationId: new mongoose.Types.ObjectId(),
      staffId: officer._id,
      staffRole: 'OFFICER',
      assignedAt: assignedTwoDaysAgo,
      dueAt: dueAfterFiveDays(assignedTwoDaysAgo),
      status: 'ASSIGNED',
    },
    {
      taskType: 'OFFICER_APPLICATION',
      applicationId: new mongoose.Types.ObjectId(),
      staffId: officer._id,
      staffRole: 'OFFICER',
      assignedAt: new Date(now - 8 * 86_400_000),
      dueAt: new Date(now - 3 * 86_400_000),
      status: 'OVERDUE',
    },
  ])
  tasks.push(...records)
  const createdDemerits = await Demerit.create([
    {
      staffTaskId: records[1]._id,
      staffId: verifier._id,
      applicationId: records[1].applicationId,
      points: 1,
      recordedAt: new Date(),
      dueAt: records[1].dueAt,
    },
    {
      staffTaskId: records[3]._id,
      staffId: officer._id,
      applicationId: records[3].applicationId,
      points: 1,
      recordedAt: new Date(),
      dueAt: records[3].dueAt,
    },
  ])
  demerits.push(...createdDemerits.map(({ _id }) => _id))

  server = app.listen(0)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  if (demerits.length) await Demerit.deleteMany({ _id: { $in: demerits } })
  if (tasks.length) await StaffTask.deleteMany({ _id: { $in: tasks.map(({ _id }) => _id) } })
  if (users.length) await User.deleteMany({ _id: { $in: users.map(({ _id }) => _id) } })
  if (department) await Department.deleteOne({ _id: department._id })
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  await mongoose.disconnect()
})

async function request(query = '', token = adminToken) {
  return fetch(`${baseUrl}/api/admin/staff-performance${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

test('period ranges use UTC calendar boundaries and custom dates are inclusive', () => {
  const now = new Date('2026-10-10T01:00:00.000Z')
  const week = resolveStaffPerformanceRange({ period: '7_DAYS' }, now)
  assert.equal(week.startDate.toISOString(), '2026-10-04T00:00:00.000Z')
  assert.equal(week.endDate.toISOString(), '2026-10-11T00:00:00.000Z')

  const custom = resolveStaffPerformanceRange({
    period: 'CUSTOM',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  }, now)
  assert.equal(custom.startDate.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(custom.endDate.toISOString(), '2026-10-04T00:00:00.000Z')
  assert.throws(() => resolveStaffPerformanceRange({ period: 'CUSTOM', startDate: '2026-10-04', endDate: '2026-10-03' }, now), { statusCode: 400 })
  assert.throws(() => resolveStaffPerformanceRange({ period: 'CUSTOM', startDate: '2026-02-30', endDate: '2026-03-01' }, now), { statusCode: 400 })
})

test('staff performance endpoint enforces Admin role and USER_MANAGE permission', async () => {
  assert.equal((await request('', null)).status, 401)
  assert.equal((await request('', nonAdminToken)).status, 403)
  assert.equal((await request('', restrictedAdminToken)).status, 403)
  const response = await request()
  assert.equal(response.status, 200)
})

test('metrics use assignment, completion, due, and demerit records with all filters', async () => {
  const response = await request(`?period=30_DAYS&role=ALL&status=ALL&departmentId=${department._id}`)
  assert.equal(response.status, 200)
  const metrics = await response.json()
  assert.equal(metrics.kpis.totalStaff, 2)
  assert.equal(metrics.kpis.openTasks, 2)
  assert.equal(metrics.kpis.completedTasks, 2)
  assert.equal(metrics.kpis.averageCompletionHours, 84)
  assert.equal(metrics.kpis.deadlineCompliancePercentage, 50)
  assert.equal(metrics.kpis.averageFirstResponseHours, null)
  assert.equal(metrics.taskAging.find(({ label }) => label === '2–3 days').count, 1)
  assert.equal(metrics.taskAging.find(({ label }) => label === 'Over 5 days').count, 1)
  assert.equal(metrics.pendingOverdueTasks, 1)
  assert.equal(metrics.leaderboard.find(({ staffId }) => staffId === String(verifier._id)).demeritPoints, 1)
  assert.equal(metrics.leaderboard.find(({ staffId }) => staffId === String(officer._id)).pendingTasks, 2)
  assert.equal(metrics.leaderboard.find(({ staffId }) => staffId === String(officer._id)).demeritPoints, 1)
  assert.equal(metrics.taskDistribution.reduce((sum, item) => sum + item.assigned, 0), 4)
  assert.equal(metrics.taskDistribution.find(({ role }) => role === 'OFFICER').completed, 1)
  assert.equal(metrics.demeritAnalysis.find(({ staffId }) => staffId === String(verifier._id)).demeritPoints, 1)
  assert.ok(metrics.performanceTrends.some(({ completedTasks }) => completedTasks > 0))
  assert.ok(metrics.performanceTrends.some(({ overdueTasks }) => overdueTasks > 0))

  const allDepartments = await request('?period=30_DAYS&departmentId=ALL&staffId=ALL')
  assert.equal(allDepartments.status, 200)
  assert.equal((await allDepartments.json()).filters.departmentId, 'ALL')

  const roleFiltered = await (await request(`?period=30_DAYS&role=OFFICER&status=OPEN&departmentId=${department._id}`)).json()
  assert.equal(roleFiltered.kpis.totalStaff, 1)
  assert.equal(roleFiltered.taskCount, 2)
  assert.equal(roleFiltered.kpis.openTasks, 2)
  assert.equal(roleFiltered.kpis.completedTasks, 0)

  const assigneeFiltered = await (await request(`?period=30_DAYS&staffId=${verifier._id}&status=OVERDUE`)).json()
  assert.equal(assigneeFiltered.taskCount, 1)
  assert.equal(assigneeFiltered.kpis.deadlineCompliancePercentage, 0)

  const searchFiltered = await (await request('?period=30_DAYS&search=Performance%20Officer')).json()
  assert.equal(searchFiltered.kpis.totalStaff, 1)
  assert.equal(searchFiltered.taskCount, 3)

  const customStart = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  const customEnd = new Date().toISOString().slice(0, 10)
  const customFiltered = await (await request(
    `?period=CUSTOM&startDate=${customStart}&endDate=${customEnd}`,
  )).json()
  assert.equal(customFiltered.filters.period, 'CUSTOM')
  assert.equal(customFiltered.taskCount, 4)
})

test('unsupported metric filters return a validation response', async () => {
  assert.equal((await request('?period=FOREVER')).status, 400)
  assert.equal((await request('?role=APPLICANT')).status, 400)
  assert.equal((await request('?status=WAITING')).status, 400)
  assert.equal((await request('?departmentId=bad-id')).status, 400)
  assert.equal((await request('?staffId=bad-id')).status, 400)
})
