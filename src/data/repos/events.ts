import { db } from '../db'
import { alive, getAlive, listAlive, makeRow, patchRow, putRow, runTx, softDelete } from '../rows'
import { detId } from '@/lib/ids'
import type { EventOccurrenceRow, EventRow } from '../types'
import type { EventType } from '@/lib/enums'

export type NewEvent = Omit<EventRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt' | 'seeded' | 'userModified' | 'done'> & { done?: boolean }

/**
 * ONE bundle for a date window: events that could produce occurrences in [from,to] plus every
 * annotation touching it (including MOVED annotations that PLACE an occurrence here from a date
 * the pattern produced elsewhere). One transaction, a fixed number of queries — no N+1.
 */
export async function getAgenda(from: string, to: string): Promise<{ events: EventRow[]; annotations: EventOccurrenceRow[] }> {
  return db.transaction('r', db.events, db.eventOccurrences, async () => {
    const candidates = await db.events.where('date').belowOrEqual(to).toArray()
    const events = alive(candidates).filter((e) => (e.recurrence === 'NONE' ? (e.endDate ?? e.date) >= from : !e.endDate || e.endDate >= from))
    const byDate = await db.eventOccurrences.where('occurrenceDate').between(from, to, true, true).toArray()
    const byMove = await db.eventOccurrences.where('movedToDate').between(from, to, true, true).toArray()
    const annotations = alive([...new Map([...byDate, ...byMove].map((a) => [a.id, a])).values()])
    const have = new Set(events.map((e) => e.id))
    const missing = [...new Set(annotations.map((a) => a.eventId))].filter((id) => !have.has(id))
    if (missing.length) {
      const extra = await db.events.bulkGet(missing)
      for (const e of extra) if (e && !e.deletedAt) events.push(e)
    }
    return { events, annotations }
  })
}

export const listEvents = () => listAlive('events')
export const getEvent = (id: string) => getAlive('events', id)

export async function listEventsByTypes(types: EventType[]): Promise<EventRow[]> {
  const parts = await Promise.all(types.map((t) => db.events.where('[type+date]').between([t, ''], [t, '\uffff']).toArray()))
  return alive(parts.flat())
}

export async function createEvent(input: NewEvent): Promise<EventRow> {
  const row = makeRow<EventRow>({ ...input, done: input.done ?? false, seeded: false, userModified: false })
  return putRow('events', row)
}
export const saveEvent = (row: EventRow) => putRow('events', row)
export const updateEvent = (id: string, patch: Partial<EventRow>) => patchRow('events', id, patch)
export const removeEvent = (id: string) => softDelete('events', id)
export const setEventDone = (id: string, done: boolean) => patchRow('events', id, { done })

/** Create-or-update the single annotation for (eventId, date). Soft-deleted annotations are revived, never duplicated. */
export async function annotateOccurrence(eventId: string, occurrenceDate: string, patch: Partial<Omit<EventOccurrenceRow, 'id' | 'eventId' | 'occurrenceDate'>> & { status: EventOccurrenceRow['status'] }): Promise<EventOccurrenceRow> {
  return runTx(['eventOccurrences'], async () => {
    const existing = await db.eventOccurrences.where('[eventId+occurrenceDate]').equals([eventId, occurrenceDate]).first()
    if (existing) {
      return patchRow('eventOccurrences', existing.id, { ...patch, deletedAt: null })
    }
    const row = makeRow<EventOccurrenceRow>({ eventId, occurrenceDate, ...patch }, detId('occurrence', eventId, occurrenceDate))
    return putRow('eventOccurrences', row)
  })
}

export async function clearOccurrence(eventId: string, occurrenceDate: string): Promise<void> {
  const existing = await db.eventOccurrences.where('[eventId+occurrenceDate]').equals([eventId, occurrenceDate]).first()
  if (existing) await softDelete('eventOccurrences', existing.id)
}
