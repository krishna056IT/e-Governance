import mongoose from 'mongoose'
import Application from '../models/Application.mjs'
import Document from '../models/Document.mjs'
import StaffTask from '../models/StaffTask.mjs'
import { createAuditEvent } from './auditService.mjs'
import { advanceApplicationToOfficerReview } from './applicationLifecycleService.mjs'
import { readExtractedText } from './documentStorage.mjs'
import Department from '../models/Department.mjs'
import { assignApplication } from './applicationAssignmentService.mjs'
import {
  assignStaffTask,
  completeStaffTask,
  getStaffTask,
  requireTaskOwnership,
} from './staffTaskService.mjs'

function requestError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export async function listHumanVerificationApplications(status = 'PENDING', actor = null) {
  const normalizedStatus = String(status).toUpperCase()
  const statusValues = new Set(['ALL', 'PENDING', 'IN_REVIEW', 'PASSED', 'REJECTED'])
  if (!statusValues.has(normalizedStatus)) {
    throw requestError('Invalid Human Verification status filter.', 400)
  }
  const applications = await Application.find({
    humanVerificationRequired: true,
    ...(normalizedStatus === 'ALL' ? {} : { humanVerificationStatus: normalizedStatus }),
  }).sort({ submittedAt: 1, _id: 1 }).lean()
  const visibleApplications = applications.filter((application) =>
    application.humanVerificationStatus !== 'IN_REVIEW' ||
    !application.humanVerifierId ||
    String(application.humanVerifierId) === String(actor?.id),
  )
  const applicationIds = visibleApplications.map(({ _id }) => _id)
  const documents = await Document.find({ applicationId: { $in: applicationIds } })
    .sort({ createdAt: 1, _id: 1 })
    .lean()
  const documentsByApplication = new Map()
  for (const document of documents) {
    const key = String(document.applicationId)
    const grouped = documentsByApplication.get(key) || []
    grouped.push(document)
    documentsByApplication.set(key, grouped)
  }
  return Promise.all(visibleApplications.map(async (application) => {
    const applicationDocuments = documentsByApplication.get(String(application._id)) || []
    const task = application.humanVerifierId
      ? await getStaffTask('HUMAN_VERIFICATION_APPLICATION', application._id, application.humanVerifierId)
      : null
    const finiteScores = applicationDocuments
      .map(({ ocrConfidence }) => ocrConfidence)
      .filter(Number.isFinite)
    return {
      id: String(application._id),
      applicationId: String(application._id),
      title: application.applicationData.title,
      applicantName: application.applicationData.applicantName,
      reason: application.humanVerificationReason,
      verificationReasons: application.verificationReasons || [],
      status: application.status,
      humanVerificationStatus: application.humanVerificationStatus,
      submittedAt: application.submittedAt,
      deadlineAt: task?.dueAt || null,
      deadlineRemainingMs: task?.status === 'ASSIGNED'
        ? Math.max(0, task.dueAt.getTime() - Date.now())
        : null,
      taskStatus: task?.status || null,
      taskAssignedAt: task?.assignedAt || null,
      documentCount: applicationDocuments.length,
      ocrScore: finiteScores.length
        ? Math.min(...finiteScores)
        : null,
      documents: applicationDocuments.map((document) => ({
        id: String(document._id),
        documentType: document.documentType || document.mimeType,
        filename: document.originalFilename,
        ocrScore: document.ocrConfidence,
        ocrThreshold: document.ocrThreshold,
        ocrStatus: document.ocrStatus,
        submittedAt: document.createdAt,
      })),
    }
  }))
}

export async function getHumanVerificationApplication(applicationId, actor = null) {
  if (!mongoose.isValidObjectId(applicationId)) return null
  const application = await Application.findOne({ _id: applicationId, humanVerificationRequired: true }).lean()
  if (!application) return null
  if (application.humanVerificationStatus === 'IN_REVIEW' && application.humanVerifierId &&
      String(application.humanVerifierId) !== String(actor?.id)) {
    throw requestError('This application is assigned to another Human Verifier.', 403)
  }
  const task = application.humanVerifierId
    ? await getStaffTask('HUMAN_VERIFICATION_APPLICATION', application._id, application.humanVerifierId)
    : null
  const documents = await Document.find({ applicationId: application._id })
    .select('+extractedTextStorageId +humanVerificationReason +extractedFields +extractedDocumentType +extractionFailureCode')
    .sort({ createdAt: 1, _id: 1 })
    .lean()
  return {
    id: String(application._id),
    applicationId: String(application._id),
    title: application.applicationData.title,
    applicantName: application.applicationData.applicantName,
    reason: application.humanVerificationReason,
    applicationData: application.applicationData,
    status: application.status,
    humanVerificationStatus: application.humanVerificationStatus,
    humanVerificationReason: application.humanVerificationReason,
    verificationReasons: application.verificationReasons || [],
    humanVerificationDecision: application.humanVerificationDecision,
    humanVerificationRejectionReason: application.humanVerificationRejectionReason,
    submittedAt: application.submittedAt,
    deadlineAt: task?.dueAt || null,
    deadlineRemainingMs: task?.status === 'ASSIGNED'
      ? Math.max(0, task.dueAt.getTime() - Date.now())
      : null,
    taskStatus: task?.status || null,
    taskAssignedAt: task?.assignedAt || null,
    documents: await Promise.all(documents.map(async (document) => ({
      id: String(document._id),
      documentType: document.documentType || document.mimeType,
      detectedDocumentType: document.extractedDocumentType || document.classification?.documentType || null,
      filename: document.originalFilename,
      mimeType: document.mimeType,
      ocrScore: document.ocrConfidence,
      ocrThreshold: document.ocrThreshold,
      ocrStatus: document.ocrStatus,
      humanVerificationReason: document.humanVerificationReason,
      extractionStatus: document.extractionStatus,
      extractionFailureCode: document.extractionFailureCode,
      extractedFields: document.extractedFields || [],
      extractedText: document.extractedTextStorageId
        ? await readExtractedText(document.extractedTextStorageId)
        : '',
      originalDocumentUrl: `/api/documents/${document._id}`,
      submittedAt: document.createdAt,
    }))),
  }
}

export async function listHumanVerificationDepartments() {
  const departments = await Department.find({ isActive: true })
    .select('_id name code')
    .sort({ name: 1, _id: 1 })
    .lean()
  return departments.map((department) => ({
    id: String(department._id),
    name: department.name,
    code: department.code,
  }))
}

export async function startHumanVerificationApplicationReview({ applicationId, actor }) {
  if (!mongoose.isValidObjectId(applicationId)) return null
  if (actor?.role !== 'HUMAN_VERIFIER' ||
      !Array.isArray(actor.permissions) ||
      !actor.permissions.includes('HUMAN_VERIFY_OCR')) {
    throw requestError('An authorized Human Verifier is required.', 403)
  }
  const now = new Date()
  const application = await Application.findOneAndUpdate(
    {
      _id: applicationId,
      status: 'HUMAN_VERIFICATION',
      humanVerificationRequired: true,
      humanVerificationStatus: 'PENDING',
    },
    {
      $set: {
        humanVerificationStatus: 'IN_REVIEW',
        humanVerifierId: actor.id,
        humanReviewStartedBy: actor.id,
        humanReviewStartedAt: now,
      },
    },
    { new: true, runValidators: true },
  ).lean()
  if (!application) {
    const current = await Application.findById(applicationId).select('humanVerificationStatus').lean()
    if (current?.humanVerificationStatus === 'IN_REVIEW') {
      throw requestError('This application is already under Human Verification review.', 409)
    }
    return null
  }
  await assignStaffTask({
    taskType: 'HUMAN_VERIFICATION_APPLICATION',
    applicationId: application._id,
    staffId: actor.id,
    staffRole: actor.role,
    assignedAt: now,
  })
  await createAuditEvent({
    applicationId: application._id,
    actor,
    action: 'APPLICATION_HUMAN_VERIFICATION_REVIEW_STARTED',
    previousStatus: 'PENDING',
    newStatus: 'IN_REVIEW',
    reason: application.humanVerificationReason,
  })
  return {
    id: String(application._id),
    humanVerificationStatus: application.humanVerificationStatus,
    humanReviewStartedAt: application.humanReviewStartedAt,
    deadlineAt: (await getStaffTask('HUMAN_VERIFICATION_APPLICATION', application._id, actor.id))?.dueAt || null,
  }
}

export async function decideHumanVerificationApplication({
  applicationId,
  actor,
  decision,
  departmentId,
  reason,
}) {
  if (!mongoose.isValidObjectId(applicationId)) return null
  if (actor?.role !== 'HUMAN_VERIFIER' ||
      !Array.isArray(actor.permissions) ||
      !actor.permissions.includes('HUMAN_VERIFY_OCR')) {
    throw requestError('An authorized Human Verifier is required.', 403)
  }
  if (decision !== 'PASS' && decision !== 'REJECT') {
    throw requestError('Decision must be PASS or REJECT.', 400)
  }
  if (decision === 'REJECT' && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000)) {
    throw requestError('A rejection reason of 1 to 2000 characters is required.', 400)
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 2000)) {
    throw requestError('Human Verification notes must not exceed 2000 characters.', 400)
  }

  const current = await Application.findOne({
    _id: applicationId,
    status: 'HUMAN_VERIFICATION',
    humanVerificationRequired: true,
    humanVerificationStatus: 'IN_REVIEW',
  }).lean()
  if (!current) throw requestError('This application is no longer under Human Verification review.', 409)
  if (current.humanVerifierId && String(current.humanVerifierId) !== String(actor.id)) {
    throw requestError('This application is assigned to another Human Verifier.', 403)
  }
  await requireTaskOwnership({
    taskType: 'HUMAN_VERIFICATION_APPLICATION',
    applicationId,
    staffId: actor.id,
  })

  if (decision === 'PASS') {
    if (!mongoose.isValidObjectId(departmentId)) {
      throw requestError('Choose a valid Department before passing the application.', 400)
    }
    const assignment = await assignApplication(applicationId, departmentId, actor)
    if (!assignment) return null
    await Document.updateMany(
      {
        applicationId,
        humanVerificationRequired: true,
        humanVerificationStatus: { $in: ['PENDING', 'IN_REVIEW'] },
      },
      {
        $set: {
          humanVerificationStatus: 'VERIFIED',
          humanVerificationDecision: 'VERIFIED',
          humanVerifiedBy: actor.id,
          humanVerifiedAt: new Date(),
          humanVerificationNote: reason?.trim() || 'Application passed Human Verification.',
        },
      },
    )
    await completeStaffTask({
      taskType: 'HUMAN_VERIFICATION_APPLICATION',
      applicationId,
      staffId: actor.id,
      completedAt: assignment.application.humanVerifiedAt || new Date(),
    })
    await createAuditEvent({
      applicationId,
      actor,
      action: 'APPLICATION_HUMAN_VERIFICATION_PASSED',
      previousStatus: 'IN_REVIEW',
      newStatus: assignment.application.humanVerificationStatus,
      reason: `Passed and manually routed to ${assignment.department.name}.${reason?.trim() ? ` ${reason.trim()}` : ''}`,
    })
    return {
      applicationId: String(applicationId),
      status: assignment.application.status,
      humanVerificationStatus: assignment.application.humanVerificationStatus,
      department: assignment.department,
      assignedOfficerId: assignment.assignedOfficer,
    }
  }

  const now = new Date()
  const updated = await Application.findOneAndUpdate(
    {
      _id: applicationId,
      status: 'HUMAN_VERIFICATION',
      humanVerificationStatus: 'IN_REVIEW',
    },
    {
      $set: {
        status: 'REJECTED',
        humanVerificationStatus: 'REJECTED',
        humanVerificationDecision: 'REJECT',
        humanVerifierId: actor.id,
        humanVerifiedAt: now,
        humanVerificationRejectionReason: reason.trim(),
      },
    },
    { new: true, runValidators: true },
  ).lean()
  if (!updated) throw requestError('This application was updated by another reviewer.', 409)
  await Document.updateMany(
    {
      applicationId,
      humanVerificationRequired: true,
      humanVerificationStatus: { $in: ['PENDING', 'IN_REVIEW'] },
    },
    {
      $set: {
        humanVerificationStatus: 'REJECTED',
        humanVerificationDecision: 'REJECTED',
        humanVerifiedBy: actor.id,
        humanVerifiedAt: now,
        humanVerificationNote: reason.trim(),
      },
    },
  )
  await completeStaffTask({
    taskType: 'HUMAN_VERIFICATION_APPLICATION',
    applicationId,
    staffId: actor.id,
    completedAt: now,
  })
  await createAuditEvent({
    applicationId,
    actor,
    action: 'APPLICATION_HUMAN_VERIFICATION_REJECTED',
    previousStatus: 'IN_REVIEW',
    newStatus: 'REJECTED',
    reason: reason.trim(),
  })
  return {
    applicationId: String(applicationId),
    status: updated.status,
    humanVerificationStatus: updated.humanVerificationStatus,
    rejectionReason: updated.humanVerificationRejectionReason,
  }
}

function isPendingVerification(document) {
  return document &&
    document.ocrStatus === 'LOW_CONFIDENCE' &&
    document.humanVerificationRequired === true &&
    ['PENDING', 'IN_REVIEW'].includes(document.humanVerificationStatus)
}

function serializeQueueItem(document, application, task = null) {
  return {
    id: String(document._id),
    applicationId: String(document.applicationId),
    applicationTitle: application?.applicationData?.title || 'Application',
    applicantName: application?.applicationData?.applicantName || 'Applicant',
    documentType: document.documentType || document.mimeType,
    filename: document.originalFilename,
    reason: document.humanVerificationReason ||
      `OCR confidence ${document.ocrConfidence}% is below the configured ${document.ocrThreshold}% threshold.`,
    ocrScore: document.ocrConfidence,
    ocrThreshold: document.ocrThreshold,
    ocrStatus: document.ocrStatus,
    humanVerificationStatus: document.humanVerificationStatus,
    submittedAt: document.createdAt,
    deadlineAt: task?.dueAt || null,
    deadlineRemainingMs: task?.status === 'ASSIGNED'
      ? Math.max(0, task.dueAt.getTime() - Date.now())
      : null,
    taskStatus: task?.status || null,
    taskAssignedAt: task?.assignedAt || null,
  }
}

export async function listPendingHumanVerifications(status = 'ALL', actor = null) {
  const normalizedStatus = String(status).toUpperCase()
  const statuses = new Set(['ALL', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED'])
  if (!statuses.has(normalizedStatus)) {
    throw requestError('Invalid human verification status filter.', 400)
  }
  const documents = await Document.find({
    ocrStatus: 'LOW_CONFIDENCE',
    humanVerificationRequired: true,
    ...(normalizedStatus === 'ALL' ? {} : { humanVerificationStatus: normalizedStatus }),
  }).sort({ createdAt: 1, _id: 1 }).lean()

  const visibleDocuments = documents.filter((document) =>
    document.humanVerificationStatus !== 'IN_REVIEW' ||
    !document.humanReviewStartedBy ||
    String(document.humanReviewStartedBy) === String(actor?.id),
  )
  const applications = await Application.find({
    _id: { $in: visibleDocuments.map((document) => document.applicationId) },
  }).select('_id applicationData.title applicationData.applicantName').lean()
  const applicationById = new Map(applications.map((application) => [String(application._id), application]))
  const tasks = await StaffTask.find({
    taskType: 'HUMAN_VERIFICATION_DOCUMENT',
    documentId: { $in: visibleDocuments.map((document) => document._id) },
    ...(actor?.id ? { staffId: actor.id } : {}),
  }).sort({ assignedAt: -1 }).lean()
  const taskByDocumentId = new Map()
  for (const task of tasks) {
    const key = String(task.documentId)
    if (!taskByDocumentId.has(key)) taskByDocumentId.set(key, task)
  }

  return visibleDocuments.map((document) =>
    serializeQueueItem(
      document,
      applicationById.get(String(document.applicationId)),
      taskByDocumentId.get(String(document._id)),
    ),
  )
}

export async function getPendingHumanVerification(documentId, actor = null) {
  if (!mongoose.isValidObjectId(documentId)) return null
  const document = await Document.findById(documentId)
    .select('+extractedTextStorageId +humanVerificationReason')
    .lean()
  if (!isPendingVerification(document)) return null
  if (document.humanVerificationStatus === 'IN_REVIEW' && document.humanReviewStartedBy &&
      String(document.humanReviewStartedBy) !== String(actor?.id)) {
    throw requestError('This document is assigned to another Human Verifier.', 403)
  }

  const [application, extractedText, task] = await Promise.all([
    Application.findById(document.applicationId).select('_id applicationData.title applicationData.applicantName').lean(),
    document.extractedTextStorageId
      ? readExtractedText(document.extractedTextStorageId)
      : Promise.resolve(''),
    document.humanReviewStartedBy
      ? getStaffTask('HUMAN_VERIFICATION_DOCUMENT', document.applicationId, document.humanReviewStartedBy, document._id)
      : null,
  ])

  return {
    ...serializeQueueItem(document, application, task),
    extractedText,
    originalDocumentUrl: `/api/documents/${document._id}`,
  }
}

export async function startHumanVerificationReview({ documentId, actor }) {
  if (!mongoose.isValidObjectId(documentId)) return null
  if (!actor?.id || !mongoose.isValidObjectId(actor.id)) {
    throw requestError('An authenticated Human Verifier is required.', 401)
  }
  const assignedAt = new Date()
  const document = await Document.findOneAndUpdate(
    {
      _id: documentId,
      ocrStatus: 'LOW_CONFIDENCE',
      humanVerificationRequired: true,
      humanVerificationStatus: 'PENDING',
    },
    {
      $set: {
        humanVerificationStatus: 'IN_REVIEW',
        humanReviewStartedBy: actor.id,
        humanReviewStartedAt: assignedAt,
      },
    },
    { new: true, runValidators: true },
  )
  if (!document) {
    const current = await Document.findById(documentId).select('humanVerificationStatus').lean()
    if (current?.humanVerificationStatus === 'IN_REVIEW') {
      throw requestError('This document is already being reviewed.', 409)
    }
    return null
  }
  const task = await assignStaffTask({
    taskType: 'HUMAN_VERIFICATION_DOCUMENT',
    applicationId: document.applicationId,
    documentId: document._id,
    staffId: actor.id,
    staffRole: actor.role,
    assignedAt,
  })
  await createAuditEvent({
    applicationId: document.applicationId,
    documentId: document._id,
    actor,
    action: 'HUMAN_VERIFICATION_REVIEW_STARTED',
    previousStatus: 'PENDING',
    newStatus: 'IN_REVIEW',
  })
  return {
    id: String(document._id),
    humanVerificationStatus: document.humanVerificationStatus,
    humanReviewStartedAt: document.humanReviewStartedAt,
    deadlineAt: task.dueAt,
  }
}

function validateCorrectedFields(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 100) {
    throw requestError('Approval requires between 1 and 100 corrected fields.', 400)
  }

  let totalLength = 0
  const normalizedFields = fields.map((field) => {
    if (
      !field ||
      typeof field !== 'object' ||
      Array.isArray(field) ||
      typeof field.name !== 'string' ||
      typeof field.value !== 'string'
    ) {
      throw requestError('Each corrected field must include a name and text value.', 400)
    }
    const name = field.name.trim()
    if (!name || name.length > 100 || field.value.length > 10000) {
      throw requestError('Corrected field names or values exceed the allowed length.', 400)
    }
    totalLength += name.length + field.value.length
    return { name, value: field.value }
  })

  if (totalLength > 50000) {
    throw requestError('The corrected OCR data exceeds the allowed size.', 400)
  }
  return normalizedFields
}

export async function decideHumanVerification({
  documentId,
  actor,
  decision,
  correctedFields,
  note,
}) {
  const verifierId = actor?.id
  if (!mongoose.isValidObjectId(documentId)) return null
  if (!['VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED'].includes(decision)) {
    throw requestError('Decision must be VERIFIED, REJECTED, or CORRECTION_REQUIRED.', 400)
  }
  if (decision !== 'VERIFIED' && (typeof note !== 'string' || !note.trim())) {
    throw requestError('A reason is required to reject the document or request a correction.', 400)
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) {
    throw requestError('Verification notes must not exceed 2000 characters.', 400)
  }

  const document = await Document.findById(documentId)
  if (!isPendingVerification(document)) {
    return null
  }
  if (document.humanVerificationStatus === 'IN_REVIEW' &&
      document.humanReviewStartedBy &&
      String(document.humanReviewStartedBy) !== String(verifierId)) {
    throw requestError('This document is assigned to another reviewer.', 403)
  }
  await requireTaskOwnership({
    taskType: 'HUMAN_VERIFICATION_DOCUMENT',
    applicationId: document.applicationId,
    documentId: document._id,
    staffId: verifierId,
  })
  if (
    !Number.isFinite(document.ocrConfidence) ||
    !Number.isFinite(document.ocrThreshold) ||
    document.ocrConfidence >= document.ocrThreshold
  ) {
    throw requestError('This document does not meet the low-confidence verification criteria.', 409)
  }

  const correctedData = decision === 'VERIFIED'
    ? validateCorrectedFields(correctedFields)
    : []
  const verifiedAt = new Date()
  const updated = await Document.findOneAndUpdate(
    {
      _id: document._id,
      ocrStatus: 'LOW_CONFIDENCE',
      humanVerificationRequired: true,
      humanVerificationStatus: { $in: ['PENDING', 'IN_REVIEW'] },
    },
    {
      $set: {
        humanVerificationStatus: decision,
        humanVerificationDecision: decision,
        humanVerifiedBy: verifierId,
        humanVerifiedAt: verifiedAt,
        humanVerificationNote: note?.trim() || null,
        correctedExtractedData: correctedData,
      },
    },
    { new: true, runValidators: true },
  )

  if (!updated) {
    throw requestError('This document is no longer pending human verification.', 409)
  }
  await completeStaffTask({
    taskType: 'HUMAN_VERIFICATION_DOCUMENT',
    applicationId: updated.applicationId,
    documentId: updated._id,
    staffId: verifierId,
    completedAt: verifiedAt,
  })
  await createAuditEvent({
    applicationId: updated.applicationId,
    documentId: updated._id,
    actor,
    action: 'HUMAN_VERIFICATION_DECISION',
    previousStatus: document.humanVerificationStatus,
    newStatus: decision,
    reason: note?.trim() || null,
  })
  if (decision === 'VERIFIED') {
    await advanceApplicationToOfficerReview(updated.applicationId, actor)
  } else if (decision === 'CORRECTION_REQUIRED') {
    const application = await Application.findOneAndUpdate(
      { _id: updated.applicationId, status: { $nin: ['APPROVED', 'REJECTED'] } },
      { $set: { status: 'CORRECTION_REQUIRED' } },
      { new: true, runValidators: true },
    )
    if (application) {
      await createAuditEvent({
        applicationId: application._id,
        actor,
        action: 'APPLICATION_CORRECTION_REQUESTED',
        previousStatus: null,
        newStatus: 'CORRECTION_REQUIRED',
        reason: note.trim(),
      })
    }
  }

  return {
    id: String(updated._id),
    humanVerificationStatus: updated.humanVerificationStatus,
    humanVerificationDecision: updated.humanVerificationDecision,
    humanVerifiedAt: updated.humanVerifiedAt,
  }
}
