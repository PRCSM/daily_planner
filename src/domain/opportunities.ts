import type { EventRow } from '@/data/types'
import type { FitPill } from '@/lib/enums'
import { monthKey, monthLabel } from './dates'
import type { DateStr } from './dates'

export const OPPORTUNITY_TYPES = ['HIRING_WINDOW', 'HACKATHON', 'OSS_DEADLINE'] as const
export const isOpportunity = (e: Pick<EventRow, 'type' | 'fitPill'>): boolean => (OPPORTUNITY_TYPES as readonly string[]).includes(e.type) && !!e.fitPill

/** CLOSED is derived at read time: once the window has ended it is closed, whatever the stored pill says. */
export function effectiveFit(e: Pick<EventRow, 'date' | 'endDate' | 'fitPill'>, today: DateStr): FitPill {
  if (e.fitPill === 'CLOSED') return 'CLOSED'
  const last = e.endDate ?? e.date
  return last < today ? 'CLOSED' : (e.fitPill ?? 'MAYBE')
}

export interface OppRow {
  event: EventRow
  fit: FitPill
  closed: boolean
}
export interface OppGroup {
  /** Rendered ONCE above the group when several rows share an identical caveat. */
  sharedCaveat?: string
  rows: OppRow[]
  earliest: DateStr
}
export interface OppMonth {
  key: string
  label: string
  groups: OppGroup[]
}

const norm = (c?: string) => (c ?? '').trim().replace(/\s+/g, ' ')

/**
 * Month sections. Within a month, rows sharing an identical caveat are grouped under that caveat
 * (shown once) and the group sits at its earliest member's date; rows with a unique caveat keep it
 * inline. CLOSED rows dim and sink to the bottom of their month but never disappear.
 */
export function groupOpportunities(events: EventRow[], today: DateStr): OppMonth[] {
  const rows: OppRow[] = events
    .filter((e) => !e.deletedAt && isOpportunity(e))
    .map((event) => {
      const fit = effectiveFit(event, today)
      return { event, fit, closed: fit === 'CLOSED' }
    })
  const byMonth = new Map<string, OppRow[]>()
  for (const r of rows) {
    const k = monthKey(r.event.date)
    byMonth.set(k, [...(byMonth.get(k) ?? []), r])
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthRows]) => {
      const open = monthRows.filter((r) => !r.closed)
      const closed = monthRows.filter((r) => r.closed)
      return { key, label: monthLabel(`${key}-01`), groups: [...buildGroups(open), ...buildGroups(closed)] }
    })
}

function buildGroups(rows: OppRow[]): OppGroup[] {
  const byCaveat = new Map<string, OppRow[]>()
  for (const r of rows) {
    const c = norm(r.event.caveat)
    if (c) byCaveat.set(c, [...(byCaveat.get(c) ?? []), r])
  }
  const groups: OppGroup[] = []
  const placed = new Set<string>()
  for (const r of rows) {
    const c = norm(r.event.caveat)
    const shared = c ? byCaveat.get(c)! : undefined
    if (shared && shared.length > 1) {
      if (placed.has(c)) continue
      placed.add(c)
      const sorted = [...shared].sort(byDate)
      groups.push({ sharedCaveat: c, rows: sorted, earliest: sorted[0]!.event.date })
    } else {
      groups.push({ rows: [r], earliest: r.event.date })
    }
  }
  return groups.sort((a, b) => a.earliest.localeCompare(b.earliest) || (a.rows[0]!.event.title).localeCompare(b.rows[0]!.event.title))
}
const byDate = (a: OppRow, b: OppRow) => a.event.date.localeCompare(b.event.date) || a.event.title.localeCompare(b.event.title)
