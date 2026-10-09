import type { UserRecord } from '../types'

export interface AdminOverview {
  applicationCount: number
  departmentCount: number
  userCount: number
  activeAdminCount: number
  automationMetrics: {
    decisionedApplicationCount: number
    autoProcessedCount: number
    humanVerificationCount: number
    automationRate: number | null
    requiredFieldCount: number
    completeFieldCount: number
    evidenceSupportedFieldCount: number
    confidenceQualifiedFieldCount: number
    fieldCompletenessRate: number | null
    evidenceSupportRate: number | null
    fieldConfidenceQualificationRate: number | null
  }
}

export interface AdminStaffTask {
  id: string
  taskType: string
  status: string
  staffId: string
  staffName: string
  role: string
  applicationId: string
  applicationTitle: string
  documentName: string | null
  assignedAt: string
  dueAt: string
  completedAt: string | null
  remainingMs: number
  overdueDurationMs: number
  demeritPoints: number
}

export interface AdminDemerit {
  id: string
  taskId: string
  staffId: string
  staffName: string
  staffEmail: string
  role: string
  taskType: string
  applicationId: string
  applicationTitle: string
  documentName: string | null
  assignedAt: string | null
  dueAt: string
  completedAt: string | null
  status: string
  overdueDurationMs: number
  points: number
  recordedAt: string
}

export interface AdminStaffTaskHistory {
  id: string
  taskType: string
  status: string
  staff: { id: string; displayName: string; email: string; role: string } | null
  application: { id: string; title: string } | null
  document: { id: string; filename: string } | null
  assignedAt: string
  dueAt: string
  completedAt: string | null
  reassignedAt: string | null
  extensions: { previousDueAt: string; newDueAt: string; reason: string; actorId: string; extendedAt: string }[]
  demerit: { points: number; recordedAt: string } | null
}

export type StaffRole = 'OFFICER' | 'GENERAL_OFFICER' | 'HUMAN_VERIFIER'
export type AccountFilter = 'ALL' | 'OFFICER' | 'GENERAL_OFFICER' | 'HUMAN_VERIFIER' | 'APPLICANT' | 'ADMIN'

export interface StaffForm {
  email: string
  password: string
  displayName: string
  role: StaffRole
  departmentId: string
  governmentOfficerId: string
}

export interface DepartmentForm {
  name: string
  code: string
  description: string
  isActive: boolean
}

export function isStaffRole(role: UserRecord['role']): role is StaffRole {
  return role === 'OFFICER' || role === 'GENERAL_OFFICER' || role === 'HUMAN_VERIFIER'
}

export function roleLabel(role: UserRecord['role']) {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function formatAdminCount(value: number) {
  return new Intl.NumberFormat().format(value)
}
