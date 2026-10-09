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

export interface StaffPerformanceFilters {
  period: 'TODAY' | '7_DAYS' | '30_DAYS' | '90_DAYS' | 'THIS_YEAR' | 'CUSTOM'
  startDate?: string
  endDate?: string
  role: string
  status: string
  departmentId: string
  staffId: string
  search: string
}

export interface StaffPerformanceMetrics {
  filters: {
    period: StaffPerformanceFilters['period']
    startDate: string
    endDate: string
    role: string
    status: string
    departmentId: string
    staffId: string
    search: string
  }
  options: {
    roles: { value: string; label: string }[]
    statuses: string[]
    departments: { id: string; name: string }[]
    assignees: { id: string; name: string; role: string }[]
  }
  kpis: {
    totalStaff: number
    openTasks: number
    averageCompletionHours: number | null
    deadlineCompliancePercentage: number | null
    averageFirstResponseHours: number | null
    completedTasks: number
  }
  pendingOverdueTasks: number
  complianceByRole: { label: string; role: string; percentage: number | null; completed: number; onTime: number }[]
  taskAging: { label: string; count: number }[]
  leaderboard: {
    rank: number
    staffId: string
    name: string
    role: string
    departmentId: string | null
    department: string
    completedTasks: number
    averageCompletionHours: number | null
    slaPercentage: number | null
    pendingTasks: number
    overdueTasks: number
    demeritPoints: number
  }[]
  taskDistribution: {
    label: string
    role: string
    assigned: number
    completed: number
    pending: number
    overdue: number
  }[]
  performanceTrends: {
    label: string
    completedTasks: number
    overdueTasks: number
    deadlineCompliancePercentage: number | null
  }[]
  demeritAnalysis: {
    staffId: string
    label: string
    role: string
    overdueTasks: number
    demeritPoints: number
  }[]
  taskCount: number
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
