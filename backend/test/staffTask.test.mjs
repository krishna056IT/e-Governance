import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import app from '../src/app.mjs'
import { connectTestDatabase } from './helpers/mongodbTestDatabase.mjs'
import { signToken } from '../src/middleware/auth.mjs'
import Application from '../src/models/Application.mjs'
import AuditEvent from '../src/models/AuditEvent.mjs'
import Demerit from '../src/models/Demerit.mjs'
import StaffTask from '../src/models/StaffTask.mjs'
import User from '../src/models/User.mjs'
import {
  assignStaffTask,
  completeStaffTask,
  extendStaffTaskDeadline,
  processOverdueStaffTasks,
} from '../src/services/staffTaskService.mjs'

const runId = `${process.pid}-${Date.now()}`
const testUsers = []
const testApplications = []
const testTasks = []
let server
let baseUrl
let applicantToken
let adminToken
let applicant
let officer
let secondOfficer
let verifier
let admin

before(async () => {
  await connectTestDatabase()

  ;[applicant, officer, secondOfficer, verifier, admin] = await User.create([
    { email: `staff-task-applicant-${runId}@example.test`, displayName: 'Task Applicant', role: 'APPLICANT' },
    { email: `staff-task-officer-${runId}@example.test`, displayName: 'Task Officer', role: 'OFFICER' },
    { email: `staff-task-officer-2-${runId}@example.test`, displayName: 'Task Officer 2', role: 'OFFICER' },
    { email: `staff-task-verifier-${runId}@example.test`, displayName: 'Task Verifier', role: 'HUMAN_VERIFIER' },
    { email: `staff-task-admin-${runId}@example.test`, displayName: 'Task Admin', role: 'ADMIN', permissions: ['USER_MANAGE'] },
  ])
  testUsers.push(applicant._id, officer._id, secondOfficer._id, verifier._id, admin._id)
  applicantToken = signToken({ id: String(applicant._id), role: applicant.role, permissions: applicant.permissions })
  adminToken = signToken({ id: String(admin._id), role: admin.role, permissions: admin.permissions })

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
  if (testTasks.length) {
    await Promise.all([
      StaffTask.deleteMany({ _id: { $in: testTasks } }),
      Demerit.deleteMany({ staffTaskId: { $in: testTasks } }),
      AuditEvent.collection.deleteMany({ applicationId: { $in: testApplications } }),
    ])
  }
  if (testApplications.length) await Application.deleteMany({ _id: { $in: testApplications } })
  if (testUsers.length) await User.deleteMany({ _id: { $in: testUsers } })
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  await mongoose.disconnect()
})

async function createApplication(fields = {}) {
  const application = await Application.create({
    applicantId: applicant._id,
    applicationData: {
      title: `Staff deadline test ${testApplications.length + 1}`,
      applicantName: 'Task Applicant',
      contactEmail: applicant.email,
      details: 'Staff deadline integration test.',
    },
    ...fields,
  })
  testApplications.push(application._id)
  return application
}

async function createTask({ staff = officer, taskType = 'OFFICER_APPLICATION', assignedAt = new Date() } = {}) {
  const application = await createApplication()
  const task = await assignStaffTask({
    taskType,
    applicationId: application._id,
    staffId: staff._id,
    staffRole: staff.role,
    assignedAt,
  })
  testTasks.push(task._id)
  return { application, task }
}

test('on-time completion is stored without a demerit', async () => {
  const assignedAt = new Date(Date.now() - 2 * 86_400_000)
  const { application, task } = await createTask({ assignedAt })
  const completedAt = new Date(assignedAt.getTime() + 4 * 86_400_000)

  const completed = await completeStaffTask({
    taskType: task.taskType,
    applicationId: application._id,
    staffId: officer._id,
    completedAt,
  })

  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.completedAt.getTime(), completedAt.getTime())
  assert.equal(await Demerit.countDocuments({ staffTaskId: task._id }), 0)
})

test('overdue scans survive repeat runs and create one auditable demerit', async () => {
  const assignedAt = new Date(Date.now() - 6 * 86_400_000)
  const { application, task } = await createTask({ assignedAt })
  const now = new Date()

  await processOverdueStaffTasks(now, { taskIds: [task._id] })
  await processOverdueStaffTasks(now, { taskIds: [task._id] })

  assert.equal((await StaffTask.findById(task._id)).status, 'OVERDUE')
  assert.equal(await Demerit.countDocuments({ staffTaskId: task._id }), 1)
  assert.equal(await AuditEvent.countDocuments({ idempotencyKey: `staff-task-demerit:${task._id}` }), 1)
  assert.ok(await Application.exists({ _id: application._id }))

  const completed = await completeStaffTask({
    taskType: task.taskType,
    applicationId: application._id,
    staffId: officer._id,
    completedAt: now,
  })
  assert.equal(completed.status, 'COMPLETED_OVERDUE')
  assert.equal(await Demerit.countDocuments({ staffTaskId: task._id }), 1)
})

test('a completion timestamp persisted before the due date prevents a late demerit', async () => {
  const assignedAt = new Date(Date.now() - 6 * 86_400_000)
  const completedAt = new Date(assignedAt.getTime() + 4 * 86_400_000)
  const application = await createApplication({
    humanVerificationRequired: true,
    humanVerificationStatus: 'PASSED',
    humanVerificationDecision: 'PASS',
    humanVerifierId: verifier._id,
    humanVerifiedAt: completedAt,
  })
  const task = await assignStaffTask({
    taskType: 'HUMAN_VERIFICATION_APPLICATION',
    applicationId: application._id,
    staffId: verifier._id,
    staffRole: verifier.role,
    assignedAt,
  })
  testTasks.push(task._id)

  await processOverdueStaffTasks(new Date(), { taskIds: [task._id] })

  const completed = await StaffTask.findById(task._id)
  assert.equal(completed.status, 'COMPLETED')
  assert.equal(completed.completedAt.getTime(), completedAt.getTime())
  assert.equal(await Demerit.countDocuments({ staffTaskId: task._id }), 0)
})

test('reassignment preserves the former owner deadline and records their demerit once', async () => {
  const assignedAt = new Date(Date.now() - 6 * 86_400_000)
  const { application, task: formerTask } = await createTask({ assignedAt })

  const replacementTask = await assignStaffTask({
    taskType: 'OFFICER_APPLICATION',
    applicationId: application._id,
    staffId: secondOfficer._id,
    staffRole: secondOfficer.role,
  })
  testTasks.push(replacementTask._id)

  assert.equal((await StaffTask.findById(formerTask._id)).status, 'REASSIGNED_OVERDUE')
  assert.equal(await Demerit.countDocuments({ staffTaskId: formerTask._id, staffId: officer._id }), 1)
  assert.equal(replacementTask.status, 'ASSIGNED')
})

test('Admin extensions require a reason, preserve history, and are access controlled', async () => {
  const { task } = await createTask()
  await assert.rejects(
    extendStaffTaskDeadline({
      actor: { id: String(admin._id), role: 'ADMIN' },
      taskId: String(task._id),
      additionalDays: 0,
      reason: 'A deadline extension must be positive.',
    }),
    { statusCode: 400 },
  )
  const extension = await extendStaffTaskDeadline({
    actor: { id: String(admin._id), role: 'ADMIN' },
    taskId: String(task._id),
    additionalDays: 2,
    reason: 'Approved leave.',
  })

  assert.equal(extension.extensions.length, 1)
  assert.equal(extension.extensions[0].reason, 'Approved leave.')
  const expectedDueAt = new Date(task.dueAt)
  expectedDueAt.setUTCDate(expectedDueAt.getUTCDate() + 2)
  assert.equal(new Date(extension.dueAt).getTime(), expectedDueAt.getTime())
  assert.equal(await AuditEvent.countDocuments({
    applicationId: task.applicationId,
    action: 'STAFF_TASK_DEADLINE_EXTENDED',
  }), 1)
  await AuditEvent.collection.deleteOne({
    idempotencyKey: `staff-task-extension:${task._id}:${new Date(extension.extensions[0].extendedAt).getTime()}`,
  })
  await processOverdueStaffTasks(new Date(), { taskIds: [task._id] })
  assert.equal(await AuditEvent.countDocuments({
    idempotencyKey: `staff-task-extension:${task._id}:${new Date(extension.extensions[0].extendedAt).getTime()}`,
  }), 1)

  const [applicantResponse, adminResponse] = await Promise.all([
    fetch(`${baseUrl}/api/admin/staff-tasks`, {
      headers: { Authorization: `Bearer ${applicantToken}` },
    }),
    fetch(`${baseUrl}/api/admin/staff-tasks/${task._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }),
  ])
  assert.equal((await fetch(`${baseUrl}/api/admin/staff-tasks`)).status, 401)
  assert.equal(applicantResponse.status, 403)
  assert.equal(adminResponse.status, 200)
  assert.equal((await adminResponse.json()).task.id, String(task._id))
})
