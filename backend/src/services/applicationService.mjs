import mongoose from 'mongoose'
import Application from '../models/Application.mjs'
import Document from '../models/Document.mjs'
import { createAuditEvent } from './auditService.mjs'
import {
  advanceApplicationToOfficerReview,
  recordApplicationProcessingTransition,
  recordApplicationStatusTransition,
  routeApplicationToHumanVerification,
} from './applicationLifecycleService.mjs'

const applicationStatuses = new Set([
  'DRAFT',
  'SUBMITTED',
  'PROCESSING',
  'HUMAN_VERIFICATION',
  'OFFICER_REVIEW',
  'ROUTED',
  'WAITING_FOR_OFFICER',
  'ASSIGNED',
  'UNDER_REVIEW',
  'ESCALATED',
  'GENERAL_OFFICER_REVIEW',
  'CORRECTION_REQUIRED',
  'RESUBMITTED',
  'APPROVED',
  'REJECTED',
])

function validationError(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function validateApplicationData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw validationError('Application information is required.')
  }

  const requiredFields = ['applicationType', 'title', 'applicantName', 'contactEmail', 'details']
  for (const field of requiredFields) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      throw validationError(`${field} is required.`)
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail.trim())) {
    throw validationError('Enter a valid contact email address.')
  }
  if (data.applicationType.trim().length > 120 ||
      data.title.trim().length > 160 ||
      data.applicantName.trim().length > 160 ||
      data.contactEmail.trim().length > 254 ||
      data.details.trim().length > 10000) {
    throw validationError('One or more application fields exceed the allowed length.')
  }
}

export function serializeApplication(application, documents = []) {
  const record = application.toObject ? application.toObject() : application
  const id = String(record._id || record.id)
  return {
    id,
    applicationId: id,
    applicantId: String(record.applicantId),
    applicationType: record.applicationType,
    title: record.applicationData.title,
    applicantName: record.applicationData.applicantName,
    contactEmail: record.applicationData.contactEmail,
    details: record.applicationData.details,
    status: record.status,
    department: null,
    deadlineAt: null,
    breachedAt: null,
    documents,
    timeline: [
      {
        id: `${id}-created`,
        label: 'Draft created',
        at: record.createdAt.toISOString(),
      },
      ...(record.submittedAt
        ? [{ id: `${id}-submitted`, label: 'Submitted', at: record.submittedAt.toISOString() }]
        : []),
    ],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    submittedAt: record.submittedAt,
  }
}

export async function createApplicantApplication(actor, data) {
  validateApplicationData(data)
  const applicantId = actor?.id
  if (!mongoose.isValidObjectId(applicantId)) {
    const error = new Error('Authenticated applicant identity is invalid.')
    error.statusCode = 401
    throw error
  }

  const application = await Application.create({
    applicantId,
    applicationType: data.applicationType.trim(),
    applicationData: {
      title: data.title.trim(),
      applicantName: data.applicantName.trim(),
      contactEmail: data.contactEmail.trim().toLowerCase(),
      details: data.details.trim(),
    },
    status: 'DRAFT',
  })
  await createAuditEvent({
    applicationId: application._id,
    actor,
    action: 'APPLICATION_CREATED',
    previousStatus: null,
    newStatus: 'DRAFT',
  })
  return serializeApplication(application)
}

export async function listApplicantApplications(applicantId) {
  const applications = await Application.find({ applicantId })
    .sort({ updatedAt: -1, _id: -1 })
    .lean()
  const documents = await Document.find({ applicationId: { $in: applications.map(({ _id }) => _id) } })
    .sort({ createdAt: 1 })
    .lean()
  const documentsByApplication = new Map()
  for (const document of documents) {
    const applicationKey = String(document.applicationId)
    const list = documentsByApplication.get(applicationKey) || []
    list.push(serializeDocument(document))
    documentsByApplication.set(applicationKey, list)
  }
  return applications.map((application) =>
    serializeApplication(application, documentsByApplication.get(String(application._id)) || []),
  )
}

export async function getApplicantApplication(applicantId, applicationId) {
  if (!mongoose.isValidObjectId(applicationId)) return null
  const application = await Application.findOne({ _id: applicationId, applicantId }).lean()
  if (!application) return null
  const documents = await Document.find({ applicationId: application._id }).sort({ createdAt: 1 }).lean()
  return serializeApplication(application, documents.map(serializeDocument))
}

export async function submitApplicantApplication(actor, applicationId) {
  const applicantId = actor?.id
  if (!mongoose.isValidObjectId(applicationId)) return null
  const application = await Application.findOne({ _id: applicationId, applicantId })
  if (!application) return null
  if (!applicationStatuses.has(application.status) || application.status !== 'DRAFT') {
    const error = new Error(`Cannot submit an application with status ${application.status}.`)
    error.statusCode = 409
    throw error
  }

  validateApplicationData({
    applicationType: application.applicationType,
    ...application.applicationData,
  })
  application.status = 'SUBMITTED'
  application.submittedAt = new Date()
  await application.save()
  await recordApplicationStatusTransition({
    applicationId: application._id,
    previousStatus: 'DRAFT',
    newStatus: 'SUBMITTED',
    actor,
    action: 'APPLICATION_SUBMITTED',
  })
  await recordApplicationProcessingTransition(application._id, actor)
  const documentsForOcr = await Document.find({ applicationId: application._id })
    .select('ocrStatus ocrConfidence ocrThreshold')
    .lean()
  const failedDocument = documentsForOcr.find((document) =>
    ['FAILED', 'LOW_CONFIDENCE'].includes(document.ocrStatus),
  )
  if (failedDocument) {
    const reason = failedDocument.ocrStatus === 'FAILED'
      ? 'A required document could not be processed by OCR.'
      : `Document OCR confidence ${failedDocument.ocrConfidence}% is below the configured ${failedDocument.ocrThreshold}% threshold.`
    await routeApplicationToHumanVerification(application._id, actor, reason)
  } else {
    await advanceApplicationToOfficerReview(application._id, actor)
  }
  const latestApplication = await Application.findById(application._id)
  const latestDocuments = await Document.find({ applicationId: application._id }).sort({ createdAt: 1 }).lean()
  return serializeApplication(latestApplication, latestDocuments.map(serializeDocument))
}

function serializeDocument(document) {
  const id = String(document._id || document.id)
  return {
    id,
    name: document.originalFilename,
    status: document.ocrStatus,
    addedAt: document.createdAt,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    ocrConfidence: document.ocrConfidence,
    ocrThreshold: document.ocrThreshold,
    humanVerificationRequired: document.humanVerificationRequired,
    humanVerificationStatus: document.humanVerificationStatus,
  }
}
