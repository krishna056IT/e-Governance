import type { DeadlineSummary } from '../types'

export const deadlineService = {
  summarize(deadlineAt: string | null, breachedAt: string | null, now: number, serverRemainingMs?: number | null): DeadlineSummary {
    if (!deadlineAt) return { deadlineAt: null, breached: false, remainingLabel: null }
    const deadline = new Date(deadlineAt)
    const remainingMs = serverRemainingMs ?? deadline.getTime() - now
    const breached = Boolean(breachedAt) || remainingMs <= 0
    const days = Math.floor(remainingMs / 86_400_000)
    const remainingLabel =
      days < 1 ? 'Due today' : days === 1 ? '1 day remaining' : `${days} days remaining`
    return { deadlineAt, breached, remainingLabel }
  },
}
