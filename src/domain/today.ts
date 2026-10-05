import type { Occurrence } from './recurrence'
import type { EventRow } from '@/data/types'
import { diffDays, toMinutes } from './dates'
import type { DateStr } from './dates'

export type DaySection = 'Morning' | 'Afternoon' | 'Evening'
export const SECTIONS: readonly DaySection[] = ['Morning', 'Afternoon', 'Evening']

/** Morning / Afternoon / Evening from startTime. Untimed → Morning. */
export function sectionFor(startTime?: string): DaySection {
  if (!startTime) return 'Morning'
  const m = toMinutes(startTime)
  if (m < 12 * 60) return 'Morning'
  if (m < 17 * 60) return 'Afternoon'
  return 'Evening'
}

export function groupBySection<T extends { startTime?: string }>(items: T[]): Record<DaySection, T[]> {
  const out: Record<DaySection, T[]> = { Morning: [], Afternoon: [], Evening: [] }
  for (const it of items) out[sectionFor(it.startTime)].push(it)
  return out
}

/** Things "due" rather than "to do": everything that isn't a study block. */
const DUE_TYPES = new Set<EventRow['type']>(['MILESTONE', 'HIRING_WINDOW', 'HACKATHON', 'APPLICATION_TASK', 'OSS_DEADLINE', 'CUSTOM'])
export const isStudyBlock = (o: Occurrence): boolean => o.event.type === 'STUDY_BLOCK'

export function splitToday(occurrences: Occurrence[]): { blocks: Occurrence[]; due: Occurrence[] } {
  return {
    blocks: occurrences.filter(isStudyBlock),
    due: occurrences.filter((o) => DUE_TYPES.has(o.event.type) && o.event.criticality !== 'INFO'),
  }
}

export const DEADLINE_HORIZON_DAYS = 14
export interface DeadlinePill {
  title: string
  date: DateStr
  daysLeft: number
}
/** The nearest HARD, not-done deadline strictly inside the next 14 days (today counts). */
export function deadlinePill(events: EventRow[], today: DateStr): DeadlinePill | null {
  let best: DeadlinePill | null = null
  for (const e of events) {
    if (e.deletedAt || e.criticality !== 'HARD' || e.done || e.type === 'STUDY_BLOCK') continue
    // For spans, the relevant moment is the END (the deadline), but a span we're already inside counts as imminent.
    const target = e.recurrence === 'NONE' && e.endDate ? e.endDate : e.date
    const daysLeft = diffDays(today, target)
    if (daysLeft < 0 || daysLeft >= DEADLINE_HORIZON_DAYS) continue
    if (!best || daysLeft < best.daysLeft) best = { title: e.title, date: target, daysLeft }
  }
  return best
}

/** Total planned minutes of timed occurrences. */
export function plannedMinutes(o: Pick<Occurrence, 'startTime' | 'endTime'>): number | null {
  if (!o.startTime || !o.endTime) return null
  return Math.max(0, toMinutes(o.endTime) - toMinutes(o.startTime))
}
