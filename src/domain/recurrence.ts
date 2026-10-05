import type { EventOccurrenceRow, EventRow } from '@/data/types'
import { addDays, compareDates, dayOfWeek, diffDays, isWeekday, maxDate, minDate } from './dates'
import type { DateStr } from './dates'

/**
 * Recurrence is expanded at READ time by this pure function — never materialised into rows.
 *   DAILY     every day from the anchor
 *   WEEKDAYS  Mon–Fri from the anchor
 *   WEEKLY    every 7 days from the anchor
 *   NONE      just the anchor — or, with endDate, a SPAN across every date in range
 * Annotations (eventOccurrences) apply on top: DONE / SKIPPED / EDITED modify an occurrence,
 * and MOVED PLACES one on a date the pattern never produces.
 */
export interface Occurrence {
  /** Unique within a result: `${eventId}@${originalDate}` */
  key: string
  eventId: string
  event: EventRow
  /** The date it is shown on (== originalDate unless moved). */
  date: DateStr
  /** The date the pattern produced (the annotation key). */
  originalDate: DateStr
  title: string
  startTime?: string
  endTime?: string
  notes?: string
  done: boolean
  moved: boolean
  edited: boolean
  /** Span events only: position within the span. */
  span?: { index: number; length: number; isStart: boolean; isEnd: boolean }
  annotation?: EventOccurrenceRow
}

const MAX_WINDOW_DAYS = 800

/** Pattern dates of one event inside [from,to]. */
export function patternDates(e: Pick<EventRow, 'date' | 'endDate' | 'recurrence'>, from: DateStr, to: DateStr): DateStr[] {
  if (compareDates(from, to) > 0) return []
  if (diffDays(from, to) > MAX_WINDOW_DAYS) to = addDays(from, MAX_WINDOW_DAYS)
  const out: DateStr[] = []
  switch (e.recurrence) {
    case 'NONE': {
      const last = e.endDate && e.endDate >= e.date ? e.endDate : e.date
      const lo = maxDate(from, e.date)
      const hi = minDate(to, last)
      for (let d = lo; compareDates(d, hi) <= 0; d = addDays(d, 1)) out.push(d)
      return out
    }
    case 'DAILY':
    case 'WEEKDAYS': {
      const lo = maxDate(from, e.date)
      const hi = e.endDate ? minDate(to, e.endDate) : to
      for (let d = lo; compareDates(d, hi) <= 0; d = addDays(d, 1)) {
        if (e.recurrence === 'DAILY' || isWeekday(d)) out.push(d)
      }
      return out
    }
    case 'WEEKLY': {
      const hi = e.endDate ? minDate(to, e.endDate) : to
      const gap = diffDays(e.date, from)
      const start = gap <= 0 ? e.date : addDays(e.date, Math.ceil(gap / 7) * 7)
      for (let d = start; compareDates(d, hi) <= 0; d = addDays(d, 7)) out.push(d)
      return out
    }
  }
}

function spanOf(e: EventRow, d: DateStr): Occurrence['span'] | undefined {
  if (e.recurrence !== 'NONE' || !e.endDate || e.endDate <= e.date) return undefined
  return { index: diffDays(e.date, d), length: diffDays(e.date, e.endDate) + 1, isStart: d === e.date, isEnd: d === e.endDate }
}

export function expandEvents(events: EventRow[], annotations: EventOccurrenceRow[], from: DateStr, to: DateStr): Occurrence[] {
  const annByKey = new Map<string, EventOccurrenceRow>()
  for (const a of annotations) if (!a.deletedAt) annByKey.set(`${a.eventId}@${a.occurrenceDate}`, a)
  const byId = new Map(events.map((e) => [e.id, e]))
  const out: Occurrence[] = []

  const build = (e: EventRow, originalDate: DateStr, shownOn: DateStr, a?: EventOccurrenceRow): Occurrence => {
    const edited = a?.status === 'EDITED' || a?.overrideTitle !== undefined || a?.overrideStartTime !== undefined || a?.overrideEndTime !== undefined || a?.overrideNotes !== undefined
    const recurring = e.recurrence !== 'NONE'
    return {
      key: `${e.id}@${originalDate}`,
      eventId: e.id,
      event: e,
      date: shownOn,
      originalDate,
      title: a?.overrideTitle ?? e.title,
      startTime: a?.overrideStartTime ?? e.startTime,
      endTime: a?.overrideEndTime ?? e.endTime,
      notes: a?.overrideNotes ?? e.notes,
      done: recurring ? a?.status === 'DONE' || (a?.status === 'MOVED' && a.completedAt !== undefined) : e.done || a?.status === 'DONE',
      moved: shownOn !== originalDate,
      edited,
      span: spanOf(e, shownOn),
      annotation: a,
    }
  }

  for (const e of events) {
    if (e.deletedAt) continue
    for (const d of patternDates(e, from, to)) {
      const a = annByKey.get(`${e.id}@${d}`)
      if (a?.status === 'SKIPPED') continue
      if (a?.status === 'MOVED' && a.movedToDate && a.movedToDate !== d) continue // shown at its new date below
      out.push(build(e, d, d, a))
    }
  }

  // PLACE moved occurrences: they appear on dates the pattern never produces.
  for (const a of annByKey.values()) {
    if (a.status !== 'MOVED' || !a.movedToDate || a.movedToDate === a.occurrenceDate) continue
    if (a.movedToDate < from || a.movedToDate > to) continue
    const e = byId.get(a.eventId)
    if (e) out.push(build(e, a.occurrenceDate, a.movedToDate, a))
  }

  return out.sort(compareOccurrences)
}

export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  return a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title) || a.key.localeCompare(b.key)
}

export const occurrencesOn = (events: EventRow[], annotations: EventOccurrenceRow[], date: DateStr): Occurrence[] => expandEvents(events, annotations, date, date)

/** Weekday-of-pattern helper used by the UI to describe a recurrence ("Weekly on Sun"). */
export function describeRecurrence(e: Pick<EventRow, 'recurrence' | 'date'>): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  switch (e.recurrence) {
    case 'NONE': return 'One-off'
    case 'DAILY': return 'Every day'
    case 'WEEKDAYS': return 'Mon–Fri'
    case 'WEEKLY': return `Weekly on ${names[dayOfWeek(e.date)]}`
  }
}
