import type { UserRecord } from '../types'

export interface AdminOverview {
  applicationCount: number
  departmentCount: number
  userCount: number
  activeAdminCount: number
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
