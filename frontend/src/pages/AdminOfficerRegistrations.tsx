import { useState } from 'react'
import { EmptyState } from '../components/ui'
import { AdminTable } from '../components/admin/AdminPrimitives'
import type { DepartmentRecord, OfficerRegistrationRecord } from '../types'

type RegistrationFilter = 'ALL' | 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

function formatDate(value?: string) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
}

export function AdminOfficerRegistrations({
  registrations,
  departmentsById,
  search,
  actionMessage,
  actionMessageIsError,
  pendingActionId,
  onView,
  onApprove,
  onReject,
  onClearSearch,
}: {
  registrations: OfficerRegistrationRecord[]
  departmentsById: Map<string, DepartmentRecord>
  search: string
  actionMessage: string
  actionMessageIsError: boolean
  pendingActionId: string | null
  onView: (registrationId: string) => Promise<OfficerRegistrationRecord>
  onApprove: (registration: OfficerRegistrationRecord) => void
  onReject: (registration: OfficerRegistrationRecord) => void
  onClearSearch: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<RegistrationFilter>('PENDING')
  const [selectedRegistration, setSelectedRegistration] = useState<OfficerRegistrationRecord | null>(null)
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState('')
  const query = search.trim().toLowerCase()
  const filtered = registrations.filter((registration) => {
    const status = registration.accountStatus || (registration.isActive ? 'ACTIVE' : 'SUSPENDED')
    const department = registration.departmentId ? departmentsById.get(registration.departmentId) : null
    return (statusFilter === 'ALL' || status === statusFilter) &&
      (!query || [
        registration.governmentOfficerId || '',
        registration.displayName,
        registration.email,
        department?.name || '',
        status,
      ].join(' ').toLowerCase().includes(query))
  })

  async function showDetails(registration: OfficerRegistrationRecord) {
    setLoadingDetailsId(registration.id)
    setDetailError('')
    try {
      setSelectedRegistration(await onView(registration.id))
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : 'Unable to load registration details.')
    } finally {
      setLoadingDetailsId(null)
    }
  }

  return (
    <>
      {actionMessage && (
        <div className={`admin-inline-message${actionMessageIsError ? ' admin-inline-message--error' : ''}`}
          role={actionMessageIsError ? 'alert' : 'status'}>
          <p>{actionMessage}</p>
        </div>
      )}
      {selectedRegistration && (
        <section className="admin-panel" aria-labelledby="officer-registration-detail">
          <div className="admin-panel__heading admin-panel__heading--wrap">
            <div>
              <p className="admin-eyebrow">REGISTRATION DETAILS</p>
              <h2 id="officer-registration-detail">{selectedRegistration.displayName}</h2>
            </div>
            <button className="button button--secondary button--small" type="button" onClick={() => setSelectedRegistration(null)}>Close details</button>
          </div>
          <dl className="admin-registration-detail">
            <div><dt>Officer type</dt><dd>{selectedRegistration.role === 'HUMAN_VERIFIER' ? 'Human Verifier Officer' : 'Government Officer'}</dd></div>
            {selectedRegistration.governmentOfficerId && <div><dt>Government Officer ID</dt><dd>{selectedRegistration.governmentOfficerId}</dd></div>}
            <div><dt>Official email</dt><dd>{selectedRegistration.email}</dd></div>
            <div><dt>Department</dt><dd>{departmentsById.get(selectedRegistration.departmentId || '')?.name || '—'}</dd></div>
            <div><dt>Status</dt><dd>{selectedRegistration.accountStatus || 'ACTIVE'}</dd></div>
            <div><dt>Registration date</dt><dd>{formatDate(selectedRegistration.createdAt)}</dd></div>
            {selectedRegistration.officerRejectionReason && (
              <div><dt>Rejection reason</dt><dd>{selectedRegistration.officerRejectionReason}</dd></div>
            )}
            {detailError && <div className="admin-inline-message admin-inline-message--error" role="alert"><p>{detailError}</p></div>}
          </dl>
        </section>
      )}
      <section className="admin-panel">
        <div className="admin-panel__heading admin-panel__heading--wrap">
          <div>
            <p className="admin-eyebrow">IDENTITY REVIEW</p>
            <h2>Officer registrations</h2>
            <p>Review Government Officer and Human Verifier Officer registrations.</p>
          </div>
          <label className="admin-filter">
            <span>Registration status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RegistrationFilter)}>
              <option value="PENDING">Pending approval</option>
              <option value="ALL">All registrations</option>
              <option value="ACTIVE">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title={registrations.length ? 'No matching registrations' : 'No Officer registrations'}
            description={registrations.length ? 'Try a different search or status filter.' : 'New registrations will appear here after a Government Officer identity is validated.'}
            action={search || statusFilter !== 'PENDING'
              ? <button className="button button--quiet button--small" type="button" onClick={() => { setStatusFilter('PENDING'); onClearSearch() }}>Clear filters</button>
              : undefined}
          />
        ) : (
          <AdminTable label="Officer registrations">
            <thead><tr><th>Officer type</th><th>Officer ID</th><th>Name</th><th>Department / organization</th><th>Email</th><th>Registration date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map((registration) => {
              const status = registration.accountStatus || (registration.isActive ? 'ACTIVE' : 'SUSPENDED')
              const department = registration.departmentId ? departmentsById.get(registration.departmentId) : null
              return (
                <tr key={registration.id}>
                  <td>{registration.role === 'HUMAN_VERIFIER' ? 'Human Verifier Officer' : 'Government Officer'}</td>
                  <td><span className="admin-code">{registration.governmentOfficerId || '—'}</span></td>
                  <td className="admin-table__primary">{registration.displayName}</td>
                  <td>{department?.name || '—'}</td>
                  <td>{registration.email}</td>
                  <td>{formatDate(registration.createdAt)}</td>
                  <td><span className={`admin-registration-status admin-registration-status--${status.toLowerCase()}`}>{status}</span></td>
                  <td className="admin-table__actions">
                    <button className="button button--secondary button--small" type="button"
                      disabled={loadingDetailsId === registration.id}
                      onClick={() => void showDetails(registration)}>
                      {loadingDetailsId === registration.id ? 'Loading…' : 'View'}
                    </button>
                    {status === 'PENDING' && <>
                      <button className="admin-text-action" type="button" disabled={pendingActionId === registration.id}
                        onClick={() => onApprove(registration)}>Approve</button>
                      <button className="admin-text-action admin-text-action--danger" type="button" disabled={pendingActionId === registration.id}
                        onClick={() => onReject(registration)}>Reject</button>
                    </>}
                  </td>
                </tr>
              )
            })}</tbody>
          </AdminTable>
        )}
      </section>
    </>
  )
}
