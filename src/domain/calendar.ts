import type { Criticality, EventType } from '@/lib/enums'
import type { Occurrence } from './recurrence'
import { diffDays } from './dates'
import type { DateStr } from './dates'

/**
 * Month-grid markers by SHAPE, not hue (works in greyscale, for colour-blind users, at a glance):
 *   HARD  → filled bar        SOFT → filled dot        INFO → hollow dot
 * Colour appears only when it carries data: a HARD item that is not done and falls within
 * the next 14 days is marked "imminent" (rendered danger).
 */
export type MarkerShape = 'bar' | 'dot' | 'ring'
export interface Marker {
  key: string
  shape: MarkerShape
  imminent: boolean
  title: string
}

export const FILTER_GROUPS = [
  { id: 'milestones', label: 'Milestones', types: ['MILESTONE'] },
  { id: 'hiring', label: 'Hiring', types: ['HIRING_WINDOW'] },
  { id: 'hackathons', label: 'Hackathons', types: ['HACKATHON'] },
  { id: 'oss', label: 'Open source', types: ['OSS_DEADLINE'] },
  { id: 'applications', label: 'Applications', types: ['APPLICATION_TASK'] },
  { id: 'mine', label: 'Mine', types: ['CUSTOM'] },
  { id: 'study', label: 'Study', types: ['STUDY_BLOCK'] },
] as const satisfies readonly { id: string; label: string; types: readonly EventType[] }[]
export type FilterId = (typeof FILTER_GROUPS)[number]['id']

const SHAPE: Record<Criticality, MarkerShape> = { HARD: 'bar', SOFT: 'dot', INFO: 'ring' }
const RANK: Record<MarkerShape, number> = { bar: 0, dot: 1, ring: 2 }
export const IMMINENT_DAYS = 14
export const MAX_MARKERS = 3

/** Which groups are visible. Nothing selected = everything except the (noisy, daily) study blocks. */
export function visibleTypes(selected: readonly string[]): Set<EventType> {
  const groups = selected.length ? FILTER_GROUPS.filter((g) => selected.includes(g.id)) : FILTER_GROUPS.filter((g) => g.id !== 'study')
  return new Set(groups.flatMap((g) => g.types as readonly EventType[]))
}

/**
 * A long window (a 3-month hiring window) would paint every day of the grid. It is marked on the day
 * it OPENS and the day it CLOSES only.
 */
export function isMarkedOccurrence(o: Occurrence): boolean {
  return !o.span || o.span.isStart || o.span.isEnd
}

export function markersByDate(occurrences: Occurrence[], today: DateStr, selected: readonly string[]): Map<DateStr, { markers: Marker[]; extra: number }> {
  const types = visibleTypes(selected)
  const byDate = new Map<DateStr, Marker[]>()
  for (const o of occurrences) {
    if (!types.has(o.event.type) || !isMarkedOccurrence(o)) continue
    const shape = SHAPE[o.event.criticality]
    const until = diffDays(today, o.date)
    const imminent = o.event.criticality === 'HARD' && !o.done && until >= 0 && until < IMMINENT_DAYS
    byDate.set(o.date, [...(byDate.get(o.date) ?? []), { key: o.key, shape, imminent, title: o.title }])
  }
  const out = new Map<DateStr, { markers: Marker[]; extra: number }>()
  for (const [d, ms] of byDate) {
    const sorted = [...ms].sort((a, b) => RANK[a.shape] - RANK[b.shape] || Number(b.imminent) - Number(a.imminent))
    out.set(d, { markers: sorted.slice(0, MAX_MARKERS), extra: Math.max(0, sorted.length - MAX_MARKERS) })
  }
  return out
}

/** Agenda for a tapped day: everything on the date (study blocks included), HARD first, then by time. */
export function agendaFor(occurrences: Occurrence[], date: DateStr): Occurrence[] {
  const rank: Record<Criticality, number> = { HARD: 0, SOFT: 1, INFO: 2 }
  return occurrences
    .filter((o) => o.date === date)
    .sort((a, b) => (a.startTime ? 1 : 0) - (b.startTime ? 1 : 0) || rank[a.event.criticality] - rank[b.event.criticality] || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title))
}
