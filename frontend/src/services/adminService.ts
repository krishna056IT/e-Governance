import type { DepartmentRecord, OfficerRegistrationRecord, UserRecord } from '../types'
import type { AdminOverview } from '../types/admin'
import type {
  AdminDemerit,
  AdminStaffTask,
  AdminStaffTaskHistory,
  StaffPerformanceFilters,
  StaffPerformanceMetrics,
} from '../types/admin'
import { API_BASE_URL } from './apiBase'

const GET_RETRY_DELAYS_MS = [500, 1500]

interface ApiError {
  error?: string
}

function safeEndpoint(endpoint: string) {
  return endpoint
    .split('?')[0]
    .replace(/\/[a-f\d]{24}(?=\/|$)/gi, '/:id')
}

function logAdminRequestFailure(
  event: 'request_retry' | 'request_failed',
  method: string,
  endpoint: string,
  details: { status?: number; errorName?: string; attempt?: number },
) {
  console.warn(JSON.stringify({
    service: 'admin_api_client',
    event,
    method,
    endpoint: safeEndpoint(endpoint),
    ...details,
  }))
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export class AdminApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = localStorage.getItem('authToken')
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response | undefined
  let attempts = 0
  for (let attempt = 0; ; attempt += 1) {
    attempts = attempt + 1
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      })
    } catch (reason) {
      const canRetry = method === 'GET' &&
        attempt < GET_RETRY_DELAYS_MS.length &&
        (!(reason instanceof DOMException) || reason.name !== 'AbortError')
      if (canRetry) {
        logAdminRequestFailure('request_retry', method, endpoint, {
          errorName: reason instanceof Error ? reason.name : 'UnknownError',
          attempt: attempt + 1,
        })
        await wait(GET_RETRY_DELAYS_MS[attempt])
        continue
      }
      logAdminRequestFailure('request_failed', method, endpoint, {
        errorName: reason instanceof Error ? reason.name : 'UnknownError',
        attempt: attempt + 1,
      })
      throw reason
    }

    const canRetry = method === 'GET' &&
      [502, 503, 504].includes(response.status) &&
      attempt < GET_RETRY_DELAYS_MS.length
    if (canRetry) {
      logAdminRequestFailure('request_retry', method, endpoint, {
        status: response.status,
        attempt: attempt + 1,
      })
      await response.body?.cancel()
      await wait(GET_RETRY_DELAYS_MS[attempt])
      continue
    }
    break
  }

  let data: (T & ApiError) | undefined
  try {
    data = (await response.json()) as T & ApiError
  } catch {
    data = undefined
  }

  if (!response.ok) {
    logAdminRequestFailure('request_failed', method, endpoint, {
      status: response.status,
      attempt: attempts,
    })
    throw new AdminApiError(data?.error || 'Something went wrong.', response.status)
  }

  if (!data) {
    logAdminRequestFailure('request_failed', method, endpoint, {
      status: response.status,
      errorName: 'InvalidResponse',
      attempt: attempts,
    })
    throw new AdminApiError('The server returned an invalid response.', response.status)
  }

  return data
}

export const adminService = {
  async getOverview() {
    return request<AdminOverview>('/admin/overview')
  },

  async listDepartments() {
    const data = await request<{ departments: DepartmentRecord[] }>('/admin/departments')
    return data.departments
  },

  async listUsers() {
    const data = await request<{ users: UserRecord[] }>('/admin/users')
    return data.users
  },

  async listDemerits() {
    const data = await request<{ demerits: AdminDemerit[] }>('/admin/demerits')
    return data.demerits
  },

  async listStaffTasks() {
    const data = await request<{ tasks: AdminStaffTask[] }>('/admin/staff-tasks')
    return data.tasks
  },

  async getStaffPerformance(filters: StaffPerformanceFilters) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== 'ALL') params.set(key, value)
    }
    const query = params.toString()
    return request<StaffPerformanceMetrics>(`/admin/staff-performance${query ? `?${query}` : ''}`)
  },

  async getStaffTaskHistory(taskId: string) {
    const data = await request<{ task: AdminStaffTaskHistory }>(`/admin/staff-tasks/${encodeURIComponent(taskId)}`)
    return data.task
  },

  async extendStaffTask(taskId: string, additionalDays: number, reason: string) {
    const data = await request<{ task: AdminStaffTaskHistory }>(`/admin/staff-tasks/${encodeURIComponent(taskId)}/extend`, {
      method: 'POST',
      body: JSON.stringify({ additionalDays, reason }),
    })
    return data.task
  },

  async listOfficerRegistrations() {
    const data = await request<{ registrations: OfficerRegistrationRecord[] }>('/admin/officer-registrations')
    return data.registrations
  },

  async getOfficerRegistration(userId: string) {
    const data = await request<{ registration: OfficerRegistrationRecord }>(`/admin/officer-registrations/${userId}`)
    return data.registration
  },

  async approveOfficerRegistration(userId: string) {
    return request<{
      success: true
      message: string
      user: OfficerRegistrationRecord
      setupExpiresAt: string
    }>(`/admin/officer-registrations/${userId}/approve`, { method: 'POST' })
  },

  async reissueOfficerPasswordSetup(userId: string) {
    return request<{
      message: string
      setupExpiresAt: string
      setupPath?: string
    }>(`/admin/officer-registrations/${userId}/reissue-setup`, { method: 'POST' })
  },

  async rejectOfficerRegistration(userId: string, reason: string) {
    const data = await request<{ registration: OfficerRegistrationRecord }>(`/admin/officer-registrations/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    return data.registration
  },

  async createDepartment(payload: { name: string; code: string; description: string; isActive: boolean }) {
    const data = await request<{ department: DepartmentRecord }>('/admin/departments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return data.department
  },

  async updateDepartment(departmentId: string, payload: { name: string; code: string; description: string }) {
    const data = await request<{ department: DepartmentRecord }>(`/admin/departments/${departmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return data.department
  },

  async createStaffUser(payload: {
    email: string
    password: string
    displayName: string
    role: 'OFFICER' | 'GENERAL_OFFICER' | 'HUMAN_VERIFIER'
    departmentId: string
    governmentOfficerId: string
  }) {
    const data = await request<{ user: UserRecord }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return data.user
  },

  async updateStaffUser(userId: string, payload: {
    role: 'OFFICER' | 'GENERAL_OFFICER' | 'HUMAN_VERIFIER'
    departmentId: string
    governmentOfficerId: string
  }) {
    const data = await request<{ user: UserRecord }>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return data.user
  },

  async activateUser(userId: string) {
    const data = await request<{ user: UserRecord }>(`/admin/users/${userId}/activate`, {
      method: 'POST',
    })
    return data.user
  },

  async deactivateUser(userId: string) {
    const data = await request<{ user: UserRecord }>(`/admin/users/${userId}/deactivate`, {
      method: 'POST',
    })
    return data.user
  },

  async activateDepartment(departmentId: string) {
    const data = await request<{ department: DepartmentRecord }>(`/admin/departments/${departmentId}/activate`, {
      method: 'POST',
    })
    return data.department
  },

  async deactivateDepartment(departmentId: string) {
    const data = await request<{ department: DepartmentRecord }>(`/admin/departments/${departmentId}/deactivate`, {
      method: 'POST',
    })
    return data.department
  },
}
