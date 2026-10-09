import mongoose from 'mongoose'
import Department from '../models/Department.mjs'
import Demerit from '../models/Demerit.mjs'
import StaffTask from '../models/StaffTask.mjs'
import User from '../models/User.mjs'

const STAFF_ROLES = ['OFFICER', 'HUMAN_VERIFIER', 'GENERAL_OFFICER']
const COMPLETED_STATUSES = ['COMPLETED', 'COMPLETED_OVERDUE']
const OVERDUE_STATUSES = ['OVERDUE', 'COMPLETED_OVERDUE', 'REASSIGNED_OVERDUE']
const OPEN_STATUSES = ['ASSIGNED', 'OVERDUE']
const DAY_MS = 86_400_000

function requestError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function parseDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw requestError(`${field} must be a date in YYYY-MM-DD format.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw requestError(`${field} must be a valid calendar date.`)
  }
  return date
}

export function resolveStaffPerformanceRange({ period = '30_DAYS', startDate, endDate } = {}, now = new Date()) {
  const normalizedPeriod = String(period).toUpperCase()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (normalizedPeriod === 'CUSTOM') {
    const start = parseDate(startDate, 'startDate')
    const inclusiveEnd = parseDate(endDate, 'endDate')
    if (start > inclusiveEnd) throw requestError('startDate must be on or before endDate.')
    const exclusiveEnd = new Date(inclusiveEnd.getTime() + DAY_MS)
    if (!Number.isFinite(exclusiveEnd.getTime())) throw requestError('endDate is outside the supported date range.')
    return {
      period: normalizedPeriod,
      startDate: start,
      endDate: exclusiveEnd,
    }
  }
  const ranges = {
    TODAY: 1,
    '7_DAYS': 7,
    '30_DAYS': 30,
    '90_DAYS': 90,
  }
  if (normalizedPeriod === 'THIS_YEAR') {
    return {
      period: normalizedPeriod,
      startDate: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      endDate: new Date(today.getTime() + DAY_MS),
    }
  }
  const days = ranges[normalizedPeriod]
  if (!days) throw requestError('Choose a supported reporting period.')
  return {
    period: normalizedPeriod,
    startDate: new Date(today.getTime() - (days - 1) * DAY_MS),
    endDate: new Date(today.getTime() + DAY_MS),
  }
}

function statusFilter(status) {
  const normalized = String(status || 'ALL').toUpperCase()
  const statuses = {
    ALL: null,
    OPEN: OPEN_STATUSES,
    COMPLETED: COMPLETED_STATUSES,
    OVERDUE: OVERDUE_STATUSES,
    ASSIGNED: ['ASSIGNED'],
  }
  if (!Object.hasOwn(statuses, normalized)) throw requestError('Choose a supported task status.')
  return { normalized, statuses: statuses[normalized] }
}

function percentage(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null
}

function roundHours(milliseconds) {
  return Math.round((milliseconds / 3_600_000) * 10) / 10
}

function taskPassesStatus(task, statuses) {
  return !statuses || statuses.includes(task.status)
}

function displayRole(role) {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildPerformanceTrends(tasks, range) {
  const weekly = range.endDate.getTime() - range.startDate.getTime() > 90 * DAY_MS
  const bucketDays = weekly ? 7 : 1
  const buckets = new Map()
  const getBucket = (date) => {
    const dayOffset = Math.floor((date.getTime() - range.startDate.getTime()) / DAY_MS)
    const index = Math.floor(dayOffset / bucketDays)
    if (!buckets.has(index)) {
      buckets.set(index, {
        start: new Date(range.startDate.getTime() + index * bucketDays * DAY_MS),
        completedTasks: 0,
        overdueTasks: 0,
        completedOnTime: 0,
      })
    }
    return buckets.get(index)
  }

  for (const task of tasks) {
    if (COMPLETED_STATUSES.includes(task.status) && task.completedAt >= range.startDate && task.completedAt < range.endDate) {
      const bucket = getBucket(task.completedAt)
      bucket.completedTasks += 1
      if (task.completedAt <= task.dueAt) bucket.completedOnTime += 1
    }
    if (OVERDUE_STATUSES.includes(task.status) && task.dueAt >= range.startDate && task.dueAt < range.endDate) {
      getBucket(task.dueAt).overdueTasks += 1
    }
  }

  return [...buckets.entries()].sort(([first], [second]) => first - second).map(([, bucket]) => ({
    label: bucket.start.toISOString().slice(0, 10),
    completedTasks: bucket.completedTasks,
    overdueTasks: bucket.overdueTasks,
    deadlineCompliancePercentage: bucket.completedTasks
      ? percentage(bucket.completedOnTime, bucket.completedTasks)
      : null,
  }))
}

export async function getStaffPerformance({ period, startDate, endDate, role, status, departmentId, staffId, search } = {}, now = new Date()) {
  const range = resolveStaffPerformanceRange({ period, startDate, endDate }, now)
  const selectedRole = String(role || 'ALL').toUpperCase()
  if (selectedRole !== 'ALL' && !STAFF_ROLES.includes(selectedRole)) {
    throw requestError('Choose a supported staff role.')
  }
  const selectedStatus = statusFilter(status)
  if (departmentId !== undefined && typeof departmentId !== 'string') {
    throw requestError('Choose a valid department.')
  }
  const selectedDepartmentId = departmentId && departmentId.toUpperCase() !== 'ALL' ? departmentId : undefined
  if (selectedDepartmentId && !mongoose.isValidObjectId(selectedDepartmentId)) {
    throw requestError('Choose a valid department.')
  }
  if (staffId !== undefined && typeof staffId !== 'string') {
    throw requestError('Choose a valid staff member.')
  }
  const selectedStaffId = staffId && staffId.toUpperCase() !== 'ALL' ? staffId : undefined
  if (selectedStaffId && !mongoose.isValidObjectId(selectedStaffId)) {
    throw requestError('Choose a valid staff member.')
  }
  const query = typeof search === 'string' ? search.trim() : ''
  if (query.length > 120) throw requestError('Search must be 120 characters or fewer.')

  const staffQuery = { role: selectedRole === 'ALL' ? { $in: STAFF_ROLES } : selectedRole }
  if (selectedDepartmentId) staffQuery.departmentId = selectedDepartmentId
  if (selectedStaffId) staffQuery._id = selectedStaffId
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    staffQuery.$or = [
      { displayName: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { governmentOfficerId: { $regex: escaped, $options: 'i' } },
    ]
  }
  const [staff, departments, allStaffOptions] = await Promise.all([
    User.find(staffQuery).select('_id displayName email role departmentId isActive accountStatus').sort({ displayName: 1, _id: 1 }).lean(),
    Department.find({ isActive: true }).select('_id name').sort({ name: 1 }).lean(),
    User.find({
      role: { $in: STAFF_ROLES },
      isActive: true,
      accountStatus: { $in: [null, 'ACTIVE'] },
    }).select('_id displayName role departmentId').sort({ displayName: 1, _id: 1 }).lean(),
  ])
  const eligibleStaff = staff.filter((user) => user.isActive && (!user.accountStatus || user.accountStatus === 'ACTIVE'))
  const staffById = new Map(staff.map((user) => [String(user._id), user]))
  const staffIds = [...staffById.keys()]
  const taskQuery = {
    staffId: { $in: staffIds },
    $or: [
      { assignedAt: { $gte: range.startDate, $lt: range.endDate } },
      { completedAt: { $gte: range.startDate, $lt: range.endDate } },
      { dueAt: { $gte: range.startDate, $lt: range.endDate } },
    ],
  }
  if (staffIds.length === 0) taskQuery.staffId = { $in: [] }

  const allTasks = staffIds.length
    ? await StaffTask.find(taskQuery)
      .select('_id staffId staffRole assignedAt dueAt completedAt status')
      .sort({ assignedAt: -1, _id: -1 })
      .lean()
    : []
  const tasks = allTasks.filter((task) =>
    task.assignedAt >= range.startDate &&
    task.assignedAt < range.endDate &&
    taskPassesStatus(task, selectedStatus.statuses),
  )
  const trendTasks = allTasks.filter((task) => taskPassesStatus(task, selectedStatus.statuses))
  const taskIds = tasks.map(({ _id }) => _id)
  const demeritTotals = taskIds.length
    ? await Demerit.aggregate([
      { $match: { staffTaskId: { $in: taskIds } } },
      { $group: { _id: '$staffId', points: { $sum: '$points' } } },
    ])
    : []
  const demeritsByStaff = new Map(demeritTotals.map(({ _id, points }) => [String(_id), points]))
  const departmentNames = new Map(departments.map(({ _id, name }) => [String(_id), name]))
  const taskRecordsByStaff = new Map()
  for (const task of tasks) {
    const staffKey = String(task.staffId)
    const group = taskRecordsByStaff.get(staffKey) || []
    group.push(task)
    taskRecordsByStaff.set(staffKey, group)
  }

  const openTasks = tasks.filter(({ status: taskStatus }) => OPEN_STATUSES.includes(taskStatus))
  const completedTasks = tasks.filter(({ status: taskStatus }) => COMPLETED_STATUSES.includes(taskStatus))
  const onTimeTasks = completedTasks.filter((task) =>
    task.completedAt && task.completedAt <= task.dueAt,
  )
  const durations = completedTasks
    .filter((task) => task.completedAt)
    .map((task) => task.completedAt.getTime() - task.assignedAt.getTime())
  const averageCompletionMs = durations.length
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : null
  const agingBuckets = [
    { label: '0–1 days', count: 0 },
    { label: '2–3 days', count: 0 },
    { label: '4–5 days', count: 0 },
    { label: 'Over 5 days', count: 0 },
  ]
  for (const task of openTasks) {
    const ageDays = Math.floor((now.getTime() - task.assignedAt.getTime()) / DAY_MS)
    const index = ageDays <= 1 ? 0 : ageDays <= 3 ? 1 : ageDays <= 5 ? 2 : 3
    agingBuckets[index].count += 1
  }

  const rolesForCharts = selectedRole === 'ALL' ? STAFF_ROLES : [selectedRole]
  const complianceByRole = rolesForCharts.map((staffRole) => {
    const roleTasks = completedTasks.filter((task) =>
      (staffById.get(String(task.staffId))?.role || task.staffRole) === staffRole,
    )
    const onTimeCount = roleTasks.filter((task) => task.completedAt && task.completedAt <= task.dueAt).length
    return {
      label: displayRole(staffRole),
      role: staffRole,
      percentage: roleTasks.length ? percentage(onTimeCount, roleTasks.length) : null,
      completed: roleTasks.length,
      onTime: onTimeCount,
    }
  })

  const leaderboard = [...taskRecordsByStaff.entries()].map(([id, staffTasks]) => {
    const member = staffById.get(id)
    const completed = staffTasks.filter(({ status: taskStatus }) => COMPLETED_STATUSES.includes(taskStatus))
    const onTime = completed.filter((task) => task.completedAt && task.completedAt <= task.dueAt)
    const durationsForMember = completed
      .filter(({ completedAt }) => completedAt)
      .map((task) => task.completedAt.getTime() - task.assignedAt.getTime())
    return {
      staffId: id,
      name: member?.displayName || 'Former staff member',
      role: member?.role || staffTasks[0].staffRole,
      departmentId: member?.departmentId || null,
      department: member?.departmentId ? departmentNames.get(String(member.departmentId)) || 'Unassigned' : 'System-wide',
      completedTasks: completed.length,
      averageCompletionHours: durationsForMember.length
        ? roundHours(durationsForMember.reduce((sum, duration) => sum + duration, 0) / durationsForMember.length)
        : null,
      slaPercentage: percentage(onTime.length, completed.length),
      pendingTasks: staffTasks.filter(({ status: taskStatus }) => OPEN_STATUSES.includes(taskStatus)).length,
      overdueTasks: staffTasks.filter(({ status: taskStatus }) => OVERDUE_STATUSES.includes(taskStatus)).length,
      demeritPoints: demeritsByStaff.get(id) || 0,
    }
  }).sort((first, second) =>
    second.completedTasks - first.completedTasks ||
    (second.slaPercentage ?? -1) - (first.slaPercentage ?? -1) ||
    first.name.localeCompare(second.name),
  ).map((row, index) => ({ rank: index + 1, ...row }))

  const distributionCounts = new Map(STAFF_ROLES.map((staffRole) => [staffRole, {
    assigned: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
  }]))
  for (const task of tasks) {
    const key = staffById.get(String(task.staffId))?.role || task.staffRole
    const counts = distributionCounts.get(key)
    if (!counts) continue
    counts.assigned += 1
    if (COMPLETED_STATUSES.includes(task.status)) counts.completed += 1
    if (OPEN_STATUSES.includes(task.status)) counts.pending += 1
    if (OVERDUE_STATUSES.includes(task.status)) counts.overdue += 1
  }
  const demeritAnalysis = [...taskRecordsByStaff.entries()].map(([id, staffTasks]) => {
    const member = staffById.get(id)
    return {
      staffId: id,
      label: member?.displayName || 'Former staff member',
      role: member?.role || staffTasks[0].staffRole,
      overdueTasks: staffTasks.filter(({ status: taskStatus }) => OVERDUE_STATUSES.includes(taskStatus)).length,
      demeritPoints: demeritsByStaff.get(id) || 0,
    }
  }).sort((first, second) =>
    second.demeritPoints - first.demeritPoints ||
    second.overdueTasks - first.overdueTasks ||
    first.label.localeCompare(second.label),
  )

  return {
    filters: {
      period: range.period,
      startDate: range.startDate.toISOString(),
      endDate: new Date(range.endDate.getTime() - 1).toISOString(),
      role: selectedRole,
      status: selectedStatus.normalized,
      departmentId: selectedDepartmentId || 'ALL',
      staffId: selectedStaffId || 'ALL',
      search: query,
    },
    options: {
      roles: STAFF_ROLES.map((value) => ({ value, label: displayRole(value) })),
      statuses: ['ALL', 'OPEN', 'COMPLETED', 'OVERDUE', 'ASSIGNED'],
      departments: departments.map(({ _id, name }) => ({ id: String(_id), name })),
      assignees: allStaffOptions.map((user) => ({
        id: String(user._id),
        name: user.displayName,
        role: user.role,
      })),
    },
    kpis: {
      totalStaff: eligibleStaff.length,
      openTasks: openTasks.length,
      averageCompletionHours: averageCompletionMs === null ? null : roundHours(averageCompletionMs),
      deadlineCompliancePercentage: percentage(onTimeTasks.length, completedTasks.length),
      averageFirstResponseHours: null,
      completedTasks: completedTasks.length,
    },
    pendingOverdueTasks: openTasks.filter(({ status: taskStatus }) => taskStatus === 'OVERDUE').length,
    complianceByRole,
    taskAging: agingBuckets,
    leaderboard,
    taskDistribution: [...distributionCounts.entries()]
      .map(([roleValue, counts]) => ({ label: displayRole(roleValue), role: roleValue, ...counts })),
    performanceTrends: buildPerformanceTrends(trendTasks, range),
    demeritAnalysis,
    taskCount: tasks.length,
  }
}
