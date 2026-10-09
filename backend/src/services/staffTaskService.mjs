import mongoose from 'mongoose'
import Application from '../models/Application.mjs'
import AuditEvent from '../models/AuditEvent.mjs'
import Demerit from '../models/Demerit.mjs'
import Document from '../models/Document.mjs'
import StaffTask from '../models/StaffTask.mjs'
import User from '../models/User.mjs'
import { isDatabaseConnected } from '../config/database.mjs'
import { databaseErrorDetails } from '../config/databaseErrors.mjs'
import { createAuditEvent } from './auditService.mjs'

let staffTaskIndexesPromise = null

function ensureDatabaseConnection() {
  return isDatabaseConnected()
}

async function ensureStaffTaskIndexes() {
  if (!staffTaskIndexesPromise) {
    staffTaskIndexesPromise = Promise.all([
    StaffTask.collection.createIndex({ status: 1, dueAt: 1 }),
    Demerit.collection.createIndex({ staffTaskId: 1 }, { unique: true }),
    AuditEvent.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
    ]).catch((error) => {
    staffTaskIndexesPromise = null
    throw error
    })
  }
  await staffTaskIndexesPromise
}

function requestError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function taskScope(taskType, applicationId, documentId = null) {
  return {
    taskType,
    applicationId,
    documentId: documentId || null,
  }
}

function addCalendarDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

async function recordDemerit(task) {
  if (!await ensureDatabaseConnection()) throw new Error('MongoDB is unavailable for recording a staff demerit.')
  await ensureStaffTaskIndexes()
  const recordedAt = new Date()
  let inserted = false
  try {
    const result = await Demerit.updateOne(
      { staffTaskId: task._id },
      {
        $setOnInsert: {
          staffTaskId: task._id,
          staffId: task.staffId,
          applicationId: task.applicationId,
          documentId: task.documentId,
          points: 1,
          recordedAt,
          dueAt: task.dueAt,
        },
      },
      { upsert: true },
    )
    inserted = result.upsertedCount === 1
  } catch (error) {
    if (error?.code !== 11000) throw error
  }

  await createAuditEvent({
    applicationId: task.applicationId,
    documentId: task.documentId,
    actor: { id: null, role: 'SYSTEM' },
    action: 'STAFF_TASK_DEMERIT_RECORDED',
    previousStatus: task.status,
    newStatus: 'OVERDUE',
    reason: `One demerit point recorded for overdue ${task.taskType} task ${task._id}, assigned to staff member ${task.staffId}.`,
    idempotencyKey: `staff-task-demerit:${task._id}`,
  })
  return inserted
}

async function ensureDeadlineExtensionAudits(taskIds) {
  const tasks = await StaffTask.find({
    'extensions.0': { $exists: true },
    ...(taskIds ? { _id: { $in: taskIds } } : {}),
  }).select('_id applicationId documentId extensions').lean()
  for (const task of tasks) {
    for (const extension of task.extensions) {
      await createAuditEvent({
        applicationId: task.applicationId,
        documentId: task.documentId,
        actor: { id: extension.actorId, role: 'ADMIN' },
        action: 'STAFF_TASK_DEADLINE_EXTENDED',
        previousStatus: 'ASSIGNED',
        newStatus: 'ASSIGNED',
        reason: `Extended task ${task._id} by ${Math.round((extension.newDueAt.getTime() - extension.previousDueAt.getTime()) / (24 * 60 * 60 * 1000))} calendar day(s): ${extension.reason}`,
        idempotencyKey: `staff-task-extension:${task._id}:${extension.extendedAt.getTime()}`,
      })
    }
  }
}

export async function assignStaffTask({
  taskType,
  applicationId,
  documentId = null,
  staffId,
  staffRole,
  assignedAt = new Date(),
}) {
  if (!mongoose.isValidObjectId(applicationId) || !mongoose.isValidObjectId(staffId)) {
    throw new Error('A staff task requires valid application and staff identities.')
  }
  const scope = taskScope(taskType, applicationId, documentId)
  const currentTasks = await StaffTask.find({ ...scope, status: { $in: ['ASSIGNED', 'OVERDUE'] } })
    .sort({ assignedAt: -1 })
    .lean()
  let existingForStaff = null
  for (const current of currentTasks) {
    if (String(current.staffId) === String(staffId)) {
      existingForStaff ||= current
      continue
    }
    const expired = current.status === 'OVERDUE' || current.dueAt <= assignedAt
    const updated = await StaffTask.findOneAndUpdate(
      { _id: current._id, status: { $in: ['ASSIGNED', 'OVERDUE'] } },
      {
        $set: {
          status: expired ? 'REASSIGNED_OVERDUE' : 'REASSIGNED',
          reassignedAt: assignedAt,
        },
      },
      { new: true },
    ).lean()
    if (updated && expired) await recordDemerit({ ...updated, status: 'OVERDUE' })
  }

  if (existingForStaff) return existingForStaff
  return StaffTask.create({
    ...scope,
    staffId,
    staffRole,
    assignedAt,
    dueAt: addCalendarDays(assignedAt, 5),
    status: 'ASSIGNED',
  })
}

export async function completeStaffTask({ taskType, applicationId, documentId = null, staffId, completedAt = new Date() }) {
  const scope = taskScope(taskType, applicationId, documentId)
  const task = await StaffTask.findOne({
    ...scope,
    staffId,
    status: { $in: ['ASSIGNED', 'OVERDUE'] },
  }).sort({ assignedAt: -1 })
  if (!task) return null

  if (task.status === 'ASSIGNED' && task.dueAt <= completedAt) {
    const overdue = await StaffTask.findOneAndUpdate(
      { _id: task._id, status: 'ASSIGNED' },
      { $set: { status: 'OVERDUE' } },
      { new: true },
    ).lean()
    if (overdue) await recordDemerit(overdue)
  }
  const late = task.dueAt <= completedAt
  const updated = await StaffTask.findOneAndUpdate(
    { _id: task._id, status: { $in: ['ASSIGNED', 'OVERDUE'] } },
    {
      $set: {
        status: late ? 'COMPLETED_OVERDUE' : 'COMPLETED',
        completedAt,
      },
    },
    { new: true },
  )
  return updated
}

export async function requireTaskOwnership({ taskType, applicationId, documentId = null, staffId }) {
  const task = await StaffTask.findOne({
    ...taskScope(taskType, applicationId, documentId),
    status: { $in: ['ASSIGNED', 'OVERDUE'] },
  }).sort({ assignedAt: -1 }).lean()
  if (task && String(task.staffId) !== String(staffId)) {
    throw requestError('This task is assigned to another staff member.', 403)
  }
  return task
}

export async function getStaffTask(taskType, applicationId, staffId, documentId = null) {
  return StaffTask.findOne({
    ...taskScope(taskType, applicationId, documentId),
    staffId,
  }).sort({ assignedAt: -1 }).lean()
}

export async function processOverdueStaffTasks(now = new Date(), { taskIds } = {}) {
  if (!ensureDatabaseConnection()) return 0
  await ensureStaffTaskIndexes()
  const overdueTasks = await StaffTask.find({
    status: 'ASSIGNED',
    dueAt: { $lte: now },
    ...(taskIds ? { _id: { $in: taskIds } } : {}),
  })
    .sort({ dueAt: 1, _id: 1 })
    .lean()
  let processedCount = 0
  for (const task of overdueTasks) {
    const completionAt = await getRecordedTaskCompletion(task)
    if (completionAt && completionAt <= task.dueAt) {
      await StaffTask.updateOne(
        { _id: task._id, status: 'ASSIGNED' },
        { $set: { status: 'COMPLETED', completedAt: completionAt } },
      )
      continue
    }
    const changed = await StaffTask.findOneAndUpdate(
      { _id: task._id, status: 'ASSIGNED', dueAt: { $lte: now } },
      { $set: { status: 'OVERDUE' } },
      { new: true },
    ).lean()
    if (!changed) continue
    await recordDemerit(changed)
    processedCount += 1
  }
  const overdueRecords = await StaffTask.find({
    status: { $in: ['OVERDUE', 'COMPLETED_OVERDUE', 'REASSIGNED_OVERDUE'] },
    ...(taskIds ? { _id: { $in: taskIds } } : {}),
  }).lean()
  for (const task of overdueRecords) await recordDemerit(task)
  await ensureDeadlineExtensionAudits(taskIds)
  return processedCount
}

async function getRecordedTaskCompletion(task) {
  if (task.taskType === 'OFFICER_APPLICATION') {
    const application = await Application.findById(task.applicationId)
      .select('officerReview.decidedBy officerReview.decidedAt')
      .lean()
    return String(application?.officerReview?.decidedBy) === String(task.staffId)
      ? application.officerReview.decidedAt
      : null
  }
  if (task.taskType === 'HUMAN_VERIFICATION_APPLICATION') {
    const application = await Application.findById(task.applicationId)
      .select('humanVerifierId humanVerifiedAt')
      .lean()
    return String(application?.humanVerifierId) === String(task.staffId)
      ? application.humanVerifiedAt
      : null
  }
  const document = await Document.findById(task.documentId)
    .select('humanVerifiedBy humanVerifiedAt')
    .lean()
  return String(document?.humanVerifiedBy) === String(task.staffId)
    ? document.humanVerifiedAt
    : null
}

export function startOverdueStaffTaskProcessor({ intervalMs = 60_000 } = {}) {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await processOverdueStaffTasks()
    } catch (error) {
      console.error(JSON.stringify({
        service: 'staff-task-deadlines',
        event: 'processing_failed',
        ...databaseErrorDetails(error),
      }))
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

export async function listDemerits() {
  const entries = await Demerit.find({}).sort({ recordedAt: -1, _id: -1 }).lean()
  const staffIds = [...new Set(entries.map(({ staffId }) => String(staffId)))]
  const taskIds = [...new Set(entries.map(({ staffTaskId }) => String(staffTaskId)))]
  const applicationIds = [...new Set(entries.map(({ applicationId }) => String(applicationId)))]
  const documentIds = [...new Set(entries.filter(({ documentId }) => documentId).map(({ documentId }) => String(documentId)))]
  const [staff, tasks, applications, documents] = await Promise.all([
    User.find({ _id: { $in: staffIds } }).select('_id displayName email role').lean(),
    StaffTask.find({ _id: { $in: taskIds } }).lean(),
    Application.find({ _id: { $in: applicationIds } }).select('_id applicationData.title').lean(),
    Document.find({ _id: { $in: documentIds } }).select('_id originalFilename').lean(),
  ])
  const byId = (items) => new Map(items.map((item) => [String(item._id), item]))
  const staffById = byId(staff)
  const taskById = byId(tasks)
  const applicationById = byId(applications)
  const documentById = byId(documents)
  const now = Date.now()
  return entries.map((entry) => {
    const task = taskById.get(String(entry.staffTaskId))
    const until = task?.completedAt || task?.reassignedAt || new Date(now)
    return {
      id: String(entry._id),
      taskId: String(entry.staffTaskId),
      staffId: String(entry.staffId),
      staffName: staffById.get(String(entry.staffId))?.displayName || 'Former staff member',
      staffEmail: staffById.get(String(entry.staffId))?.email || '',
      role: staffById.get(String(entry.staffId))?.role || task?.staffRole || 'OFFICER',
      taskType: task?.taskType || 'OFFICER_APPLICATION',
      applicationId: String(entry.applicationId),
      applicationTitle: applicationById.get(String(entry.applicationId))?.applicationData?.title || 'Application',
      documentName: entry.documentId ? documentById.get(String(entry.documentId))?.originalFilename || null : null,
      assignedAt: task?.assignedAt || null,
      dueAt: entry.dueAt,
      completedAt: task?.completedAt || null,
      status: task?.status || 'OVERDUE',
      overdueDurationMs: Math.max(0, until.getTime() - entry.dueAt.getTime()),
      points: entry.points,
      recordedAt: entry.recordedAt,
    }
  })
}

export async function listAdminStaffTasks() {
  const tasks = await StaffTask.find({ status: { $in: ['ASSIGNED', 'OVERDUE'] } })
    .sort({ dueAt: 1, _id: 1 })
    .lean()
  const staffIds = [...new Set(tasks.map(({ staffId }) => String(staffId)))]
  const applicationIds = [...new Set(tasks.map(({ applicationId }) => String(applicationId)))]
  const documentIds = [...new Set(tasks.filter(({ documentId }) => documentId).map(({ documentId }) => String(documentId)))]
  const taskIds = tasks.map(({ _id }) => _id)
  const [staff, applications, documents, demerits] = await Promise.all([
    User.find({ _id: { $in: staffIds } }).select('_id displayName email role').lean(),
    Application.find({ _id: { $in: applicationIds } }).select('_id applicationData.title').lean(),
    Document.find({ _id: { $in: documentIds } }).select('_id originalFilename').lean(),
    Demerit.find({ staffTaskId: { $in: taskIds } }).select('staffTaskId points').lean(),
  ])
  const byId = (items) => new Map(items.map((item) => [String(item._id), item]))
  const staffById = byId(staff)
  const applicationById = byId(applications)
  const documentById = byId(documents)
  const demeritByTaskId = new Map(demerits.map((item) => [String(item.staffTaskId), item.points]))
  const now = Date.now()
  return tasks.map((task) => ({
    id: String(task._id),
    taskType: task.taskType,
    status: task.status === 'ASSIGNED' && task.dueAt.getTime() <= now ? 'OVERDUE' : task.status,
    staffId: String(task.staffId),
    staffName: staffById.get(String(task.staffId))?.displayName || 'Former staff member',
    role: staffById.get(String(task.staffId))?.role || task.staffRole,
    applicationId: String(task.applicationId),
    applicationTitle: applicationById.get(String(task.applicationId))?.applicationData?.title || 'Application',
    documentName: task.documentId ? documentById.get(String(task.documentId))?.originalFilename || null : null,
    assignedAt: task.assignedAt,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    remainingMs: task.status === 'ASSIGNED' ? Math.max(0, task.dueAt.getTime() - now) : 0,
    overdueDurationMs: ['OVERDUE', 'ASSIGNED'].includes(task.status)
      ? Math.max(0, now - task.dueAt.getTime())
      : 0,
    demeritPoints: demeritByTaskId.get(String(task._id)) || 0,
  }))
}

export async function getStaffTaskHistory(taskId) {
  if (!mongoose.isValidObjectId(taskId)) return null
  const task = await StaffTask.findById(taskId).lean()
  if (!task) return null
  const [staff, application, document, demerit] = await Promise.all([
    User.findById(task.staffId).select('_id displayName email role').lean(),
    Application.findById(task.applicationId).select('_id applicationData.title').lean(),
    task.documentId ? Document.findById(task.documentId).select('_id originalFilename').lean() : null,
    Demerit.findOne({ staffTaskId: task._id }).lean(),
  ])
  return {
    id: String(task._id),
    taskType: task.taskType,
    status: task.status,
    staff: staff ? { id: String(staff._id), displayName: staff.displayName, email: staff.email, role: staff.role } : null,
    application: application ? { id: String(application._id), title: application.applicationData.title } : null,
    document: document ? { id: String(document._id), filename: document.originalFilename } : null,
    assignedAt: task.assignedAt,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    reassignedAt: task.reassignedAt,
    extensions: task.extensions,
    demerit: demerit ? { points: demerit.points, recordedAt: demerit.recordedAt } : null,
  }
}

export async function extendStaffTaskDeadline({ actor, taskId, additionalDays, reason }) {
  if (!mongoose.isValidObjectId(taskId)) throw requestError('Staff task not found.', 404)
  if (!Number.isSafeInteger(additionalDays) || additionalDays < 1) {
    throw requestError('Deadline extensions must be a positive whole number of calendar days.', 400)
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
    throw requestError('A reason of 1 to 2000 characters is required for a deadline extension.', 400)
  }
  const now = new Date()
  const task = await StaffTask.findOne({ _id: taskId, status: 'ASSIGNED', dueAt: { $gt: now } })
  if (!task) throw requestError('Only an active task that is not yet overdue can be extended.', 409)
  const previousDueAt = task.dueAt
  const newDueAt = addCalendarDays(previousDueAt, additionalDays)
  if (!Number.isFinite(newDueAt.getTime())) {
    throw requestError('The requested deadline extension is outside the supported date range.', 400)
  }
  const updated = await StaffTask.findOneAndUpdate(
    {
      _id: taskId,
      status: 'ASSIGNED',
      $and: [{ dueAt: previousDueAt }, { dueAt: { $gt: now } }],
    },
    {
      $set: { dueAt: newDueAt },
      $push: {
        extensions: {
          previousDueAt,
          newDueAt,
          reason: reason.trim(),
          actorId: actor.id,
          extendedAt: now,
        },
      },
    },
    { new: true, runValidators: true },
  )
  if (!updated) throw requestError('This task changed before its deadline could be extended.', 409)
  await createAuditEvent({
    applicationId: updated.applicationId,
    documentId: updated.documentId,
    actor,
    action: 'STAFF_TASK_DEADLINE_EXTENDED',
    previousStatus: updated.status,
    newStatus: updated.status,
    reason: `Extended task ${updated._id} by ${additionalDays} calendar day(s): ${reason.trim()}`,
    idempotencyKey: `staff-task-extension:${updated._id}:${now.getTime()}`,
  })
  return getStaffTaskHistory(updated._id)
}
