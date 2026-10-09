import { EmptyState } from '../components/ui'
import { AdminStatCard } from '../components/admin/AdminPrimitives'
import type { AdminSection } from '../components/AdminLayout'
import type { DepartmentRecord, UserRecord } from '../types'
import type { AdminOverview } from '../types/admin'
import type { AdminDemerit, AdminStaffTask, AdminStaffTaskHistory } from '../types/admin'
import { formatAdminCount, roleLabel } from '../types/admin'

export function AdminDashboardHome({
  overview,
  departments,
  staffUsers,
  activeDepartmentCount,
  actionMessage,
  actionMessageIsError,
  overdueDemerits,
  staffTasks,
  taskHistory,
  onChangeSection,
  onInspectTask,
  onExtendTask,
}: {
  overview: AdminOverview
  departments: DepartmentRecord[]
  staffUsers: UserRecord[]
  activeDepartmentCount: number
  actionMessage: string
  actionMessageIsError: boolean
  overdueDemerits: AdminDemerit[]
  staffTasks: AdminStaffTask[]
  taskHistory: AdminStaffTaskHistory | null
  onChangeSection: (section: AdminSection) => void
  onInspectTask: (taskId: string) => void
  onExtendTask: (task: AdminStaffTask) => void
}) {
  const activeStaff = staffUsers.filter((user) => user.isActive !== false).length
  const departmentSummaries = departments
    .slice()
    .sort((first, second) => first.name.localeCompare(second.name))
  const departmentActivity = departmentSummaries.map((department) => ({
    name: department.name,
    value: department.pendingApplicationCount || department.officerCount || 0,
  }))
  const maxDepartmentActivity = Math.max(...departmentActivity.map((department) => department.value), 1)

  return (
    <>
      <section className="admin-dashboard-intro">
        <p className="admin-eyebrow">PLATFORM OVERVIEW</p>
        <h2>Admin Dashboard</h2>
        <p>Monitor departments, applications, and operational health from one workspace.</p>
      </section>

      <section className="admin-stats" aria-label="Organization metrics">
        <AdminStatCard label="Applications" value={overview.applicationCount} description="Total records in the system" icon="▤" />
        <AdminStatCard label="Departments" value={overview.departmentCount} description={`${activeDepartmentCount} currently active`} icon="⌂" tone="blue" />
        <AdminStatCard label="Officer accounts" value={staffUsers.filter((user) => user.role === 'OFFICER').length} description={`${activeStaff} active staff accounts`} icon="♙" tone="amber" />
        <AdminStatCard label="Automation decisions" value={overview.automationMetrics.decisionedApplicationCount} description={`${overview.automationMetrics.humanVerificationCount} sent for human verification`} icon="✓" tone="slate" />
      </section>

      {actionMessage && <p className={`admin-inline-message${actionMessageIsError ? ' admin-inline-message--error' : ''}`} role={actionMessageIsError ? 'alert' : 'status'}>{actionMessage}</p>}

      <section className="admin-panel">
        <div className="admin-panel__heading">
          <div><p className="admin-eyebrow">STAFF ACCOUNTABILITY</p><h2>Overdue tasks and demerits</h2><p>One point is recorded for each assignment that passes its due date unfinished.</p></div>
        </div>
        {!overdueDemerits.length ? <p className="admin-muted">No staff demerits have been recorded.</p> : (
          <div className="admin-table-scroll" role="region" aria-label="Overdue staff task demerits" tabIndex={0}>
            <table className="admin-table">
              <thead><tr><th>Staff member</th><th>Role</th><th>Overdue task</th><th>Due date</th><th>Overdue duration</th><th>Points</th><th>History</th></tr></thead>
              <tbody>{overdueDemerits.map((item) => (
                <tr key={item.id}>
                  <td><span className="admin-table__primary">{item.staffName}</span><span className="admin-table__secondary">{item.staffEmail}</span></td>
                  <td>{roleLabel(item.role as UserRecord['role'])}</td>
                  <td>{item.documentName || item.applicationTitle}</td>
                  <td>{new Date(item.dueAt).toLocaleString()}</td>
                  <td>{formatDuration(item.overdueDurationMs)}</td>
                  <td>{item.points}</td>
                  <td><button className="button button--secondary button--small" type="button" onClick={() => onInspectTask(item.taskId)}>Inspect task</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel__heading">
          <div><p className="admin-eyebrow">DEADLINE MANAGEMENT</p><h2>Active staff assignments</h2><p>Admin extensions require a positive number of calendar days and an audited reason.</p></div>
        </div>
        {!staffTasks.length ? <p className="admin-muted">There are no assigned Officer or Human Verifier tasks.</p> : (
          <div className="admin-table-scroll" role="region" aria-label="Active staff assignments" tabIndex={0}>
            <table className="admin-table">
              <thead><tr><th>Staff member</th><th>Role</th><th>Task</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{staffTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.staffName}</td>
                  <td>{roleLabel(task.role as UserRecord['role'])}</td>
                  <td>{task.documentName || task.applicationTitle}</td>
                  <td>{new Date(task.dueAt).toLocaleString()}</td>
                  <td>{task.status === 'OVERDUE' ? `OVERDUE · ${formatDuration(task.overdueDurationMs)}` : formatDuration(task.remainingMs)}</td>
                  <td className="admin-table__actions">
                    <button className="button button--secondary button--small" type="button" onClick={() => onInspectTask(task.id)}>Inspect</button>
                    {task.status === 'ASSIGNED' && <button className="admin-text-action" type="button" onClick={() => onExtendTask(task)}>Extend deadline</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {taskHistory && <section className="admin-panel">
        <div className="admin-panel__heading">
          <div><p className="admin-eyebrow">TASK AUDIT HISTORY</p><h2>{taskHistory.application?.title || 'Staff task'}</h2></div>
          <button className="button button--quiet button--small" type="button" onClick={() => onInspectTask('')}>Close</button>
        </div>
        <dl className="admin-health-list">
          <div><dt>Staff member</dt><dd>{taskHistory.staff?.displayName || 'Former staff member'}</dd></div>
          <div><dt>Role</dt><dd>{taskHistory.staff?.role || '—'}</dd></div>
          <div><dt>Task</dt><dd>{taskHistory.document?.filename || taskHistory.application?.title || taskHistory.taskType}</dd></div>
          <div><dt>Assigned</dt><dd>{new Date(taskHistory.assignedAt).toLocaleString()}</dd></div>
          <div><dt>Due</dt><dd>{new Date(taskHistory.dueAt).toLocaleString()}</dd></div>
          <div><dt>Completed</dt><dd>{taskHistory.completedAt ? new Date(taskHistory.completedAt).toLocaleString() : 'Not completed'}</dd></div>
          <div><dt>Status</dt><dd>{taskHistory.status}</dd></div>
          <div><dt>Demerit</dt><dd>{taskHistory.demerit ? `${taskHistory.demerit.points} point(s), recorded ${new Date(taskHistory.demerit.recordedAt).toLocaleString()}` : 'None'}</dd></div>
        </dl>
        <h3>Authorized deadline extensions</h3>
        {taskHistory.extensions.length ? <ul>{taskHistory.extensions.map((extension, index) => <li key={`${extension.extendedAt}-${index}`}>{new Date(extension.previousDueAt).toLocaleString()} → {new Date(extension.newDueAt).toLocaleString()} · {extension.reason} · {new Date(extension.extendedAt).toLocaleString()}</li>)}</ul> : <p className="admin-muted">No extension has been recorded.</p>}
      </section>}

      <div className="admin-dashboard-columns">
      <section className="admin-panel admin-chart-panel">
        <div className="admin-panel__heading">
          <div>
            <p className="admin-eyebrow">ACTIVITY</p>
            <h2>Applications by department</h2>
            <p>Live pending-application and officer-assignment activity.</p>
          </div>
        </div>
        {departmentActivity.length === 0 ? <EmptyState title="No departments yet" description="Create a department to see activity here." action={<button className="button button--primary button--small" type="button" onClick={() => onChangeSection('departments')}>Create department</button>} /> : (
          <div className="admin-bar-chart" aria-label="Department activity">
            {departmentActivity.map((department) => <div className="admin-bar-chart__row" key={department.name}><span>{department.name}</span><div><i style={{ width: `${Math.max((department.value / maxDepartmentActivity) * 100, 4)}%` }} /></div><strong>{formatAdminCount(department.value)}</strong></div>)}
          </div>
        )}
      </section>
      <section className="admin-panel admin-health-panel">
        <p className="admin-eyebrow">SYSTEM STATUS</p>
        <h2>Platform health</h2>
        <div className="admin-health-status"><span aria-hidden="true">✓</span><div><strong>All admin services available</strong><small>Live data loaded successfully</small></div></div>
        <dl className="admin-health-list">
          <div><dt>Active departments</dt><dd>{activeDepartmentCount}</dd></div>
          <div><dt>Active staff accounts</dt><dd>{activeStaff}</dd></div>
          <div><dt>Pending verification</dt><dd>{overview.automationMetrics.humanVerificationCount}</dd></div>
        </dl>
      </section>
      </div>

      <div className="admin-dashboard-notes">
        <section className="admin-panel admin-panel--compact">
          <p className="admin-eyebrow">APPLICATIONS</p>
          <h2>Application records</h2>
          <strong className="admin-highlight-number">{formatAdminCount(overview.applicationCount)}</strong>
          <p className="admin-muted">
            {overview.automationMetrics.automationRate === null
              ? 'No automated-processing decisions have been recorded yet.'
              : `${overview.automationMetrics.automationRate}% automatically processed across ${formatAdminCount(overview.automationMetrics.decisionedApplicationCount)} evaluated applications.`}
          </p>
          <div className="admin-role-summary">
            <div><span>Automatically processed</span><strong>{formatAdminCount(overview.automationMetrics.autoProcessedCount)}</strong></div>
            <div><span>Sent to Human Verification</span><strong>{formatAdminCount(overview.automationMetrics.humanVerificationCount)}</strong></div>
            <div><span>Critical-field evidence supported</span><strong>
              {overview.automationMetrics.evidenceSupportRate === null
                ? '—'
                : `${overview.automationMetrics.evidenceSupportRate}%`}
            </strong></div>
            <div><span>Fields meeting model-confidence threshold</span><strong>
              {overview.automationMetrics.fieldConfidenceQualificationRate === null
                ? '—'
                : `${overview.automationMetrics.fieldConfidenceQualificationRate}%`}
            </strong></div>
          </div>
        </section>
        <section className="admin-panel admin-panel--compact">
          <p className="admin-eyebrow">STAFF</p>
          <h2>Staff account summary</h2>
          <div className="admin-role-summary">
            {(['OFFICER', 'GENERAL_OFFICER', 'HUMAN_VERIFIER'] as const).map((role) => (
              <div key={role}><span>{roleLabel(role)}</span><strong>{formatAdminCount(staffUsers.filter((user) => user.role === role).length)}</strong></div>
            ))}
          </div>
          <p className="admin-muted">Staff coverage is shown from the current department assignments.</p>
        </section>
      </div>
      <section className="admin-panel admin-activity-panel">
        <div className="admin-panel__heading">
          <div>
            <p className="admin-eyebrow">OPERATIONS</p>
            <h2>Recent activity</h2>
            <p>Current platform events and queues from the Admin API.</p>
          </div>
        </div>
        <div className="admin-activity-list">
          <div><span>Application records available</span><strong>{formatAdminCount(overview.applicationCount)}</strong><em>Current</em></div>
          <div><span>Applications sent for Human Verification</span><strong>{formatAdminCount(overview.automationMetrics.humanVerificationCount)}</strong><em>Review queue</em></div>
          <div><span>Active departments</span><strong>{formatAdminCount(activeDepartmentCount)}</strong><em>Operational</em></div>
          <div><span>Active staff accounts</span><strong>{formatAdminCount(activeStaff)}</strong><em>Operational</em></div>
        </div>
      </section>
    </>
  )
}

function formatDuration(milliseconds: number) {
  const hours = Math.ceil(Math.max(0, milliseconds) / 3_600_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  return `${hours}h`
}
