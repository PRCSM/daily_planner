import { annotateOccurrence, clearOccurrence, setEventDone } from '@/data/repos/events'
import { readClock } from '@/lib/clock'
import type { Occurrence } from '@/domain/recurrence'

/** Ticking an occurrence: recurring → a per-date annotation; one-off → the event's own `done`. */
export async function setOccurrenceDone(o: Pick<Occurrence, 'eventId' | 'originalDate' | 'event'>, done: boolean): Promise<void> {
  if (o.event.recurrence === 'NONE') {
    await setEventDone(o.eventId, done)
    return
  }
  if (done) await annotateOccurrence(o.eventId, o.originalDate, { status: 'DONE', completedAt: readClock().iso })
  else await clearOccurrence(o.eventId, o.originalDate)
}

export const skipOccurrence = (o: Pick<Occurrence, 'eventId' | 'originalDate'>) => annotateOccurrence(o.eventId, o.originalDate, { status: 'SKIPPED' })
export const moveOccurrence = (o: Pick<Occurrence, 'eventId' | 'originalDate'>, to: string) => annotateOccurrence(o.eventId, o.originalDate, { status: 'MOVED', movedToDate: to })
