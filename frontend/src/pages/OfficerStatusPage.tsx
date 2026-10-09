import { useEffect, useMemo, useState } from 'react'
import { AdminTable } from '../components/admin/AdminPrimitives'
import { ErrorState, LoadingState } from '../components/ui'
import { adminService } from '../services/adminService'
import type { StaffPerformanceFilters, StaffPerformanceMetrics } from '../types/admin'

const periods: { value: StaffPerformanceFilters['period']; label: string }[] = [
  { value: 'TODAY', label: 'Today' },
  { value: '7_DAYS', label: '7 Days' },
  { value: '30_DAYS', label: '30 Days' },
  { value: '90_DAYS', label: '90 Days' },
  { value: 'THIS_YEAR', label: 'This Year' },
]

function localDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shortDuration(hours: number | null) {
  if (hours === null) return '—'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.round(hours % 24)
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
}

function percent(value: number | null) {
  return value === null ? '—' : `${value}%`
}

function HorizontalBars({
  items,
  value,
  emptyMessage,
  formatValue,
  palette,
  maximum: fixedMaximum,
}: {
  items: { label: string; count?: number; percentage?: number | null; onTime?: number; completed?: number }[]
  value: (item: { label: string; count?: number; percentage?: number | null; onTime?: number; completed?: number }) => number
  emptyMessage: string
  formatValue: (item: { label: string; count?: number; percentage?: number | null; onTime?: number; completed?: number }) => string
  palette: string[]
  maximum?: number
}) {
  const maximum = fixedMaximum ?? Math.max(...items.map(value), 1)
  if (!items.some((item) => value(item) > 0)) {
    return <p className="officer-chart-empty">{emptyMessage}</p>
  }
  return (
    <div className="officer-hbar-chart">
      {items.map((item, index) => {
        const amount = value(item)
        return (
          <div className="officer-hbar-row" key={item.label}>
            <span className="officer-hbar-row__label">{item.label}</span>
            <div className="officer-hbar-track">
              <span style={{
                width: `${Math.max((amount / maximum) * 100, amount > 0 ? 2 : 0)}%`,
                backgroundColor: palette[index % palette.length],
              }} />
            </div>
            <strong>{formatValue(item)}</strong>
          </div>
        )
      })}
    </div>
  )
}

function PerformanceTrendChart({ items }: { items: StaffPerformanceMetrics['performanceTrends'] }) {
  if (!items.length) {
    return <p className="officer-chart-empty">No completion or overdue history is available for this period.</p>
  }
  const width = 760
  const height = 250
  const left = 42
  const right = 42
  const top = 16
  const bottom = 42
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maximumTasks = Math.max(...items.flatMap((item) => [item.completedTasks, item.overdueTasks]), 1)
  const x = (index: number) => left + (items.length < 2 ? plotWidth / 2 : (index / (items.length - 1)) * plotWidth)
  const taskY = (value: number) => top + plotHeight - (value / maximumTasks) * plotHeight
  const complianceY = (value: number) => top + plotHeight - (value / 100) * plotHeight
  const pathFor = (valueAt: (item: StaffPerformanceMetrics['performanceTrends'][number]) => number | null, y: (value: number) => number) => {
    let segment = ''
    const paths: string[] = []
    items.forEach((item, index) => {
      const value = valueAt(item)
      if (value === null) {
        if (segment) paths.push(segment)
        segment = ''
        return
      }
      segment += `${segment ? ' ' : 'M'}${x(index)},${y(value)}`
    })
    if (segment) paths.push(segment)
    return paths
  }
  const completedPath = pathFor((item) => item.completedTasks, taskY)
  const overduePath = pathFor((item) => item.overdueTasks, taskY)
  const compliancePath = pathFor((item) => item.deadlineCompliancePercentage, complianceY)
  const tickIndexes = [...new Set([0, Math.floor((items.length - 1) / 2), items.length - 1])]

  return (
    <div className="officer-trend-chart">
      <div className="officer-chart-legend">
        <span><i className="officer-legend-dot officer-legend-dot--completed" />Completed</span>
        <span><i className="officer-legend-dot officer-legend-dot--overdue" />Overdue</span>
        <span><i className="officer-legend-dot officer-legend-dot--compliance" />Deadline compliance</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Completion, overdue, and deadline compliance trends">
        {[0, 0.5, 1].map((fraction) => {
          const yPosition = top + plotHeight * fraction
          return (
            <g key={fraction}>
              <line x1={left} x2={width - right} y1={yPosition} y2={yPosition} className="officer-trend-gridline" />
              <text x={left - 8} y={yPosition + 3} textAnchor="end" className="officer-trend-axis-label">
                {Math.round(maximumTasks * (1 - fraction))}
              </text>
              <text x={width - right + 8} y={yPosition + 3} textAnchor="start" className="officer-trend-axis-label">
                {Math.round(100 * (1 - fraction))}%
              </text>
            </g>
          )
        })}
        {completedPath.map((path, index) => <path key={`completed-${index}`} d={path} className="officer-trend-line officer-trend-line--completed" />)}
        {overduePath.map((path, index) => <path key={`overdue-${index}`} d={path} className="officer-trend-line officer-trend-line--overdue" />)}
        {compliancePath.map((path, index) => <path key={`compliance-${index}`} d={path} className="officer-trend-line officer-trend-line--compliance" />)}
        {items.map((item, index) => (
          <g key={item.label}>
            <circle cx={x(index)} cy={taskY(item.completedTasks)} r="3" className="officer-trend-point officer-trend-point--completed" />
            <circle cx={x(index)} cy={taskY(item.overdueTasks)} r="3" className="officer-trend-point officer-trend-point--overdue" />
            {item.deadlineCompliancePercentage !== null && (
              <circle cx={x(index)} cy={complianceY(item.deadlineCompliancePercentage)} r="3" className="officer-trend-point officer-trend-point--compliance" />
            )}
          </g>
        ))}
        {tickIndexes.map((index) => (
          <text key={items[index].label} x={x(index)} y={height - 12} textAnchor="middle" className="officer-trend-axis-label">
            {new Date(`${items[index].label}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </text>
        ))}
      </svg>
      <div className="officer-trend-axis-caption"><span>Tasks</span><span>Compliance</span></div>
    </div>
  )
}

function WorkloadChart({ items }: { items: StaffPerformanceMetrics['taskDistribution'] }) {
  const maximum = Math.max(...items.flatMap((item) => [item.assigned, item.completed, item.pending, item.overdue]), 1)
  const series = [
    { key: 'assigned', label: 'Assigned', color: '#0d9b91' },
    { key: 'completed', label: 'Completed', color: '#397fc3' },
    { key: 'pending', label: 'Pending', color: '#e5a329' },
    { key: 'overdue', label: 'Overdue', color: '#df6260' },
  ] as const
  if (!items.some((item) => item.assigned > 0)) {
    return <p className="officer-chart-empty">No task distribution to display.</p>
  }
  return (
    <>
      <div className="officer-chart-legend">
        {series.map((item) => <span key={item.key}><i className="officer-legend-dot" style={{ backgroundColor: item.color }} />{item.label}</span>)}
      </div>
      <div className="officer-workload-chart" role="img" aria-label="Assigned, completed, pending, and overdue tasks by staff role">
        {items.map((item) => (
          <div className="officer-workload-group" key={item.role}>
            <div className="officer-workload-bars">
              {series.map((entry) => {
                const value = item[entry.key]
                return (
                  <div className="officer-workload-bar-wrap" key={entry.key} title={`${entry.label}: ${value}`}>
                    <strong>{value}</strong>
                    <i style={{ height: `${value ? Math.max((value / maximum) * 100, 3) : 0}%`, backgroundColor: entry.color }} />
                  </div>
                )
              })}
            </div>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </>
  )
}

function DemeritAnalysisChart({ items }: { items: StaffPerformanceMetrics['demeritAnalysis'] }) {
  const maximum = Math.max(...items.flatMap((item) => [item.overdueTasks, item.demeritPoints]), 1)
  if (!items.length || !items.some((item) => item.overdueTasks > 0 || item.demeritPoints > 0)) {
    return <p className="officer-chart-empty">No overdue assignments or recorded demerits in this period.</p>
  }
  return (
    <>
      <div className="officer-chart-legend">
        <span><i className="officer-legend-dot officer-legend-dot--overdue" />Overdue assignments</span>
        <span><i className="officer-legend-dot officer-legend-dot--demerit" />Demerit points</span>
      </div>
      <div className="officer-demerit-chart">
        {items.filter((item) => item.overdueTasks > 0 || item.demeritPoints > 0).map((item) => (
          <div className="officer-demerit-row" key={item.staffId}>
            <span title={`${item.label} · ${item.role.replaceAll('_', ' ')}`}>{item.label}</span>
            <div className="officer-demerit-bars">
              <div><i className="officer-demerit-bar--overdue" style={{ width: `${(item.overdueTasks / maximum) * 100}%` }} /><strong>{item.overdueTasks}</strong></div>
              <div><i className="officer-demerit-bar--points" style={{ width: `${(item.demeritPoints / maximum) * 100}%` }} /><strong>{item.demeritPoints}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function OfficerStatusPage({
  searchValue,
}: {
  searchValue: string
}) {
  const [period, setPeriod] = useState<StaffPerformanceFilters['period']>('30_DAYS')
  const [customStart, setCustomStart] = useState(() => {
    const start = new Date()
    start.setDate(start.getDate() - 29)
    return localDateInputValue(start)
  })
  const [customEnd, setCustomEnd] = useState(() => localDateInputValue(new Date()))
  const [role, setRole] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [departmentId, setDepartmentId] = useState('ALL')
  const [staffId, setStaffId] = useState('ALL')
  const [metrics, setMetrics] = useState<StaffPerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      const filters: StaffPerformanceFilters = {
        period,
        role,
        status,
        departmentId,
        staffId,
        search: searchValue.trim(),
        ...(period === 'CUSTOM' ? { startDate: customStart, endDate: customEnd } : {}),
      }
      adminService.getStaffPerformance(filters)
        .then((result) => {
          if (active) setMetrics(result)
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : 'Officer performance data could not be loaded.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [period, role, status, departmentId, staffId, searchValue, customStart, customEnd, refreshKey])

  const maxAging = Math.max(...(metrics?.taskAging.map(({ count }) => count) || [0]), 1)
  const selectedPeriodLabel = useMemo(() =>
    periods.find((item) => item.value === period)?.label || 'Custom range',
  [period])

  return (
    <section className="officer-status-page">
      <div className="officer-status-heading">
        <div>
          <p className="officer-status-eyebrow">STAFF PERFORMANCE</p>
          <h2>Officer Status</h2>
          <p>Track staff workload, completion times, and five-day deadline performance.</p>
        </div>
        <button className="officer-refresh" type="button" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>
          <span aria-hidden="true">↻</span> Refresh
        </button>
      </div>

      <div className="officer-filters" aria-label="Staff performance filters">
        <div className="officer-period-row">
          <strong><span aria-hidden="true">▽</span> Filters</strong>
          <span className="officer-filter-caption">Period:</span>
          {periods.map((item) => (
            <button
              key={item.value}
              className={`officer-period-button${period === item.value ? ' officer-period-button--active' : ''}`}
              type="button"
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </button>
          ))}
          <button
            className={`officer-period-button officer-period-button--custom${period === 'CUSTOM' ? ' officer-period-button--active' : ''}`}
            type="button"
            aria-pressed={period === 'CUSTOM'}
            onClick={() => setPeriod('CUSTOM')}
          >
            <span aria-hidden="true">▦</span> Custom range
          </button>
          {period === 'CUSTOM' && (
            <div className="officer-date-range">
              <label>From <input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label>
              <span>to</span>
              <label>To <input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></label>
            </div>
          )}
        </div>
        <div className="officer-select-row">
          <label><span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="ALL">All roles</option>
              {metrics?.options.roles.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label><span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {(metrics?.options.statuses || ['ALL', 'OPEN', 'COMPLETED', 'OVERDUE', 'ASSIGNED']).map((value) => (
                <option value={value} key={value}>{value === 'ALL' ? 'All statuses' : value === 'OPEN' ? 'Open tasks' : value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>
              ))}
            </select>
          </label>
          <label><span>Department / team</span>
            <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="ALL">All departments</option>
              {metrics?.options.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label><span>Assignee</span>
            <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              <option value="ALL">All staff</option>
              {metrics?.options.assignees.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <span className="officer-filter-summary">{selectedPeriodLabel}</span>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => setRefreshKey((value) => value + 1)} />}
      {loading && !metrics ? <LoadingState label="Loading staff performance…" /> : !error && metrics && (
        <>
          <div className="officer-analytics-grid">
            <section className="officer-panel">
              <div className="officer-panel-heading">
                <span className="officer-panel-icon" aria-hidden="true">◎</span>
                <div><h3>Deadline Compliance</h3><p>Eligible completed assignments finished within five calendar days</p></div>
              </div>
              <div className="officer-target-badge">Target: complete within 5 days</div>
              {loading ? <div className="officer-chart-loading"><span /></div> : (
                <HorizontalBars
                  items={metrics.complianceByRole}
                  value={(item) => item.percentage ?? 0}
                  formatValue={(item) => item.percentage === null ? 'No completed work' : `${item.percentage}% · ${item.onTime}/${item.completed}`}
                  emptyMessage="No eligible completed assignments in this period."
                  palette={['#0d9b91', '#17b8aa', '#58c8bb']}
                  maximum={100}
                />
              )}
              <div className="officer-chart-footnote">Pending overdue assignments are shown separately in aging and workload charts.</div>
            </section>

            <section className="officer-panel">
              <div className="officer-panel-heading">
                <span className="officer-panel-icon" aria-hidden="true">◷</span>
                <div><h3>Task Aging</h3><p>Pending assignments by age, including overdue work</p></div>
              </div>
              {loading ? <div className="officer-chart-loading"><span /></div> : !metrics.taskAging.some(({ count }) => count > 0) ? (
                <p className="officer-chart-empty">No open tasks in this period.</p>
              ) : (
                <>
                  <div className="officer-aging-chart">
                    {metrics.taskAging.map((item, index) => (
                      <div className="officer-aging-row" key={item.label}>
                        <span>{item.label}</span>
                        <div><i style={{ width: `${(item.count / maxAging) * 100}%`, backgroundColor: ['#149e92', '#3bc5b5', '#ee991c', '#e94b4d'][index] }} /></div>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="officer-aging-axis"><span>0</span><span>{Math.ceil(maxAging / 2)}</span><span>{maxAging}</span><span>tasks</span></div>
                </>
              )}
              <p className="officer-overdue-summary">Pending overdue assignments: <strong>{metrics.pendingOverdueTasks}</strong></p>
            </section>

            <section className="officer-panel officer-panel--leaderboard">
              <div className="officer-panel-heading">
                <span className="officer-panel-icon" aria-hidden="true">♙</span>
                <div><h3>Staff Leaderboard</h3><p>Performance rankings for Officers and Human Verifiers</p></div>
              </div>
              {loading ? <div className="officer-chart-loading"><span /></div> : metrics.leaderboard.length ? (
                <AdminTable label="Staff performance leaderboard">
                <thead><tr><th>Rank</th><th>Staff member</th><th>Role / Department</th><th>Completed</th><th>Avg time</th><th>Deadline compliance</th><th>Pending workload</th><th>Overdue</th><th>Demerits</th></tr></thead>
                  <tbody>{metrics.leaderboard.map((member) => (
                    <tr key={member.staffId}>
                      <td><span className={`officer-rank officer-rank--${member.rank <= 3 ? member.rank : 'other'}`}>{member.rank}</span></td>
                      <td><strong className="officer-leader-name">{member.name}</strong></td>
                      <td><span className="officer-role-name">{member.role.replaceAll('_', ' ')}</span><small className="officer-department-name">{member.department}</small></td>
                      <td><span className="officer-pill officer-pill--good">{member.completedTasks}</span></td>
                      <td>{shortDuration(member.averageCompletionHours)}</td>
                      <td><span className={`officer-pill ${member.slaPercentage !== null && member.slaPercentage >= 80 ? 'officer-pill--good' : member.slaPercentage === null ? '' : 'officer-pill--warn'}`}>{percent(member.slaPercentage)}</span></td>
                      <td><span className="officer-pill">{member.pendingTasks}</span></td>
                      <td><span className={`officer-pill ${member.overdueTasks ? 'officer-pill--bad' : 'officer-pill--good'}`}>{member.overdueTasks}</span></td>
                      <td><span className={`officer-pill ${member.demeritPoints ? 'officer-pill--bad' : 'officer-pill--good'}`}>{member.demeritPoints}</span></td>
                    </tr>
                  ))}</tbody>
                </AdminTable>
              ) : <p className="officer-chart-empty">No staff task records match these filters.</p>}
            </section>

            <section className="officer-panel officer-panel--wide">
              <div className="officer-panel-heading">
                <span className="officer-panel-icon" aria-hidden="true">⌁</span>
                <div><h3>Workload Distribution</h3><p>Assigned, completed, pending, and overdue work by staff role</p></div>
              </div>
              {loading ? <div className="officer-chart-loading"><span /></div> : <WorkloadChart items={metrics.taskDistribution} />}
            </section>

            <section className="officer-panel">
              <div className="officer-panel-heading">
                <span className="officer-panel-icon" aria-hidden="true">⌁</span>
                <div><h3>Performance Trends</h3><p>Completions, overdue deadlines, and compliance for this reporting period</p></div>
              </div>
              {loading ? <div className="officer-chart-loading"><span /></div> : <PerformanceTrendChart items={metrics.performanceTrends} />}
            </section>

            <section className="officer-panel">
              <div className="officer-panel-heading">
                <span className="officer-panel-icon" aria-hidden="true">!</span>
                <div><h3>Demerit Analysis</h3><p>Overdue assignments compared with recorded demerit points by staff</p></div>
              </div>
              {loading ? <div className="officer-chart-loading"><span /></div> : <DemeritAnalysisChart items={metrics.demeritAnalysis} />}
            </section>
          </div>
          <p className="officer-status-updated">
            {metrics.taskCount ? `${metrics.taskCount.toLocaleString()} assignment records · ` : ''}
            Reporting {new Date(metrics.filters.startDate).toLocaleDateString()} – {new Date(metrics.filters.endDate).toLocaleDateString()}
          </p>
        </>
      )}
    </section>
  )
}
