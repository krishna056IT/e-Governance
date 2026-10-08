export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'HUMAN_VERIFICATION'
  | 'OFFICER_REVIEW'
  | 'ROUTED'
  | 'WAITING_FOR_OFFICER'
  | 'ASSIGNED'
  | 'UNDER_REVIEW'
  | 'ESCALATED'
  | 'GENERAL_OFFICER_REVIEW'
  | 'CORRECTION_REQUIRED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED'

export type UserRole =
  | 'APPLICANT'
  | 'OFFICER'
  | 'GENERAL_OFFICER'
  | 'HUMAN_VERIFIER'
  | 'ADMIN'

export interface UserRecord {
  id: string
  email: string
  displayName: string
  role: UserRole
  departmentId?: string | null
  governmentOfficerId?: string | null
  permissions?: string[]
  isActive?: boolean
  accountStatus?: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | null
  mustChangePassword?: boolean
  officerRejectionReason?: string | null
  createdAt?: string
}

export interface DepartmentRecord {
  id: string
  name: string
  code?: string
  description?: string
  isActive?: boolean
  officerCount?: number
  pendingApplicationCount?: number
  createdAt?: string
  isCodeEditable?: boolean
}

export interface OfficerRegistrationRecord extends UserRecord {
  accountStatus: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
  officerApprovedAt?: string | null
  officerRejectedAt?: string | null
}

export interface OfficerRecord {
  id: string
  governmentOfficerId: string
  departmentId: string
}

export interface ApplicationDeadline {
  deadlineAt: string | null
  breachedAt: string | null
}

export interface ApplicationDocument {
  id: string
  name: string
  status: string
  addedAt: string
  mimeType: string
  fileSize: number
  documentType?: string
  ocrConfidence: number | null
  ocrThreshold: number | null
  humanVerificationRequired: boolean
  humanVerificationStatus: HumanVerificationStatus | null
  ocrStatus?: OcrStatus
  extractedText?: string
  correctedExtractedData?: VerifiedExtractedField[]
  humanVerificationDecision?: 'VERIFIED' | 'REJECTED' | 'CORRECTION_REQUIRED' | null
  humanVerifiedBy?: string | null
  humanVerifiedAt?: string | null
  humanVerificationNote?: string | null
}

export type OcrStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'LOW_CONFIDENCE'
  | 'FAILED'

export type HumanVerificationStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'CORRECTION_REQUIRED'

export interface HumanVerificationDocument {
  id: string
  applicationId: string
  applicationTitle: string
  applicantName: string
  documentType: string
  filename: string
  reason: string
  ocrScore: number
  ocrThreshold: number
  ocrStatus: OcrStatus
  extractedText: string
  humanVerificationStatus: HumanVerificationStatus
  submittedAt: string
  originalDocumentUrl?: string
}

export interface HumanVerificationApplicationDocument {
  id: string
  documentType: string
  filename: string
  mimeType: string
  ocrScore: number | null
  ocrThreshold: number | null
  ocrStatus: OcrStatus
  humanVerificationReason?: string | null
  extractedText: string
  originalDocumentUrl: string
  submittedAt: string
}

export interface HumanVerificationApplication {
  id: string
  applicationId: string
  applicationType: string
  title: string
  applicantName: string
  status: ApplicationStatus
  humanVerificationStatus: 'PENDING' | 'IN_REVIEW' | 'PASSED' | 'REJECTED'
  reason: string | null
  submittedAt: string | null
  documentCount: number
  ocrScore: number | null
  documents: HumanVerificationApplicationDocument[]
  applicationData?: {
    title: string
    applicantName: string
    contactEmail: string
    details: string
  }
  humanVerificationReason?: string | null
  humanVerificationDecision?: 'PASS' | 'REJECT' | null
  humanVerificationRejectionReason?: string | null
}

export interface VerifiedExtractedField {
  name: string
  value: string
}

export interface TimelineEntry {
  id: string
  label: string
  detail?: string
  at: string
}

export type TimelineEvent = TimelineEntry

export interface Escalation {
  originatingOfficer: string
  createdAt: string
  note: string
}

export interface NotificationRecord {
  id: string
  title: string
  message: string
  createdAt: string
  read: boolean
}

export interface ApplicationRecord {
  id: string
  applicationType: string
  applicantId: string
  title: string
  applicantName: string
  contactEmail: string
  details: string
  status: ApplicationStatus
  department: string | null
  deadlineAt: ApplicationDeadline['deadlineAt']
  breachedAt: ApplicationDeadline['breachedAt']
  documents: ApplicationDocument[]
  timeline: TimelineEntry[]
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  escalation?: Escalation
  departmentId?: string
  applicant?: { id: string; name: string; email: string } | null
  officerReview?: {
    startedBy: string | null
    startedAt: string | null
    decision: 'APPROVED' | 'REJECTED' | 'ESCALATED' | null
    decidedBy: string | null
    decidedAt: string | null
    reason: string | null
    notes: {
      officerId: string
      officerName: string
      action: 'STARTED' | 'APPROVED' | 'REJECTED' | 'ESCALATED'
      note: string | null
      at: string
    }[]
  }
  generalOfficerReview?: {
    decision: 'APPROVED' | 'REJECTED' | null
    decidedBy: string | null
    decidedAt: string | null
    reason: string | null
    notes: {
      generalOfficerId: string
      generalOfficerName: string
      action: 'APPROVED' | 'REJECTED'
      reason: string | null
      at: string
    }[]
  }
}

export interface ApplicationDraft {
  applicationType: string
  title: string
  applicantName: string
  contactEmail: string
  details: string
}

export interface DeadlineSummary {
  deadlineAt: string | null
  breached: boolean
  remainingLabel: string | null
}

export type UserArea =
  | 'applicant'
  | 'officer'
  | 'general-officer'
  | 'human-verifier'
  | 'admin'