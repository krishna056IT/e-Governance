import { EmptyState } from '../components/ui'
import { AdminStatus, AdminStatCard, AdminTable } from '../components/admin/AdminPrimitives'
import type { AdminSection } from '../components/AdminLayout'
import type { DepartmentRecord, UserRecord } from '../types'
import type { AdminOverview } from '../types/admin'
import { formatAdminCount, roleLabel } from '../types/admin'

export function AdminDashboardHome({
  overview,
  departments,
  staffUsers,
  activeDepartmentCount,
  actionMessage,
  actionMessageIsError,
  onChangeSection,
}: {
  overview: AdminOverview
  departments: DepartmentRecord[]
  staffUsers: UserRecord[]
  activeDepartmentCount: number
  actionMessage: string
  actionMessageIsError: boolean
  onChangeSection: (section: AdminSection) => void
}) {
  const activeStaff = staffUsers.filter((user) => user.isActive !== false).length
  const departmentSummaries = departments
    .slice()
    .sort((first, second) => first.name.localeCompare(second.name))

  return (
    <>
      <section className="admin-welcome">
        <div>
          <p className="admin-eyebrow">OVERVIEW</p>
          <h2>Welcome to the administration portal</h2>
          <p>Monitor available organization records and manage departments and staff accounts.</p>
        </div>
        <span className="admin-welcome__seal" aria-hidden="true">G</span>
      </section>

      <section className="admin-stats" aria-label="Organization metrics">
        <AdminStatCard label="Applications" value={overview.applicationCount} description="Total records in the system" icon="▤" />
        <AdminStatCard label="Departments" value={overview.departmentCount} description={`${activeDepartmentCount} currently active`} icon="⌂" tone="blue" />
        <AdminStatCard label="Officer accounts" value={staffUsers.filter((user) => user.role === 'OFFICER').length} description={`${activeStaff} active staff accounts`} icon="♙" tone="amber" />
        <AdminStatCard label="User accounts" value={overview.userCount} description={`${overview.activeAdminCount} active administrator${overview.activeAdminCount === 1 ? '' : 's'}`} icon="◎" tone="slate" />
      </section>

      {actionMessage && <p className={`admin-inline-message${actionMessageIsError ? ' admin-inline-message--error' : ''}`} role={actionMessageIsError ? 'alert' : 'status'}>{actionMessage}</p>}

      <section className="admin-panel">
        <div className="admin-panel__heading">
          <div>
            <p className="admin-eyebrow">ORGANIZATION</p>
            <h2>Department overview</h2>
            <p>Current department records and staff association counts.</p>
          </div>
          <button className="button button--secondary button--small" type="button" onClick={() => onChangeSection('departments')}>
            Manage departments <span aria-hidden="true">→</span>
          </button>
        </div>
        {departmentSummaries.length === 0 ? (
          <EmptyState
            title="No departments yet"
            description="Create a department to make staff assignments available."
            action={<button className="button button--primary button--small" type="button" onClick={() => onChangeSection('departments')}>Create department</button>}
          />
        ) : (
          <AdminTable label="Department overview">
            <thead><tr><th>Department</th><th>Code</th><th>Staff accounts</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>
              {departmentSummaries.map((department) => {
                const count = staffUsers.filter((user) => user.departmentId === department.id).length
                return (
                  <tr key={department.id}>
                    <td className="admin-table__primary">{department.name}</td>
                    <td><span className="admin-code">{department.code || '—'}</span></td>
                    <td>{formatAdminCount(count)}</td>
                    <td><AdminStatus active={department.isActive !== false} /></td>
                    <td><button className="admin-text-action" type="button" onClick={() => onChangeSection('departments')}>Open directory</button></td>
                  </tr>
                )
              })}
            </tbody>
          </AdminTable>
        )}
      </section>

      <div className="admin-dashboard-notes">
        <section className="admin-panel admin-panel--compact">
          <p className="admin-eyebrow">APPLICATIONS</p>
          <h2>Application records</h2>
          <strong className="admin-highlight-number">{formatAdminCount(overview.applicationCount)}</strong>
          <p className="admin-muted">The current Admin API provides the overall count only. Application lists and status distributions are not available in this workspace.</p>
        </section>
        <section className="admin-panel admin-panel--compact">
          <p className="admin-eyebrow">STAFF</p>
          <h2>Staff account summary</h2>
          <div className="admin-role-summary">
            {(['OFFICER', 'GENERAL_OFFICER', 'HUMAN_VERIFIER'] as const).map((role) => (
              <div key={role}><span>{roleLabel(role)}</span><strong>{formatAdminCount(staffUsers.filter((user) => user.role === role).length)}</strong></div>
            ))}
          </div>
          <button className="admin-text-action" type="button" onClick={() => onChangeSection('officers')}>Manage staff accounts <span aria-hidden="true">→</span></button>
        </section>
      </div>
    </>
  )
}
