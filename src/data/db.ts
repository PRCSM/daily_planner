import Dexie, { type EntityTable } from 'dexie'
import type { SyncTable } from '@/lib/enums'
import type { SyncMetaRow, SyncQueueRow, TableRowMap } from './types'

/** Bump when the Dexie schema changes (add a `.version(n+1)` block, never edit an old one). */
export const SCHEMA_VERSION = 1

type Tables = { [K in keyof TableRowMap]: EntityTable<TableRowMap[K], 'id'> } & {
  syncQueue: EntityTable<SyncQueueRow, 'id'>
  syncMeta: EntityTable<SyncMetaRow, 'key'>
}

export class CadenceDB extends Dexie {
  events!: Tables['events']
  eventOccurrences!: Tables['eventOccurrences']
  dailyLogs!: Tables['dailyLogs']
  logBlocks!: Tables['logBlocks']
  dsaProblems!: Tables['dsaProblems']
  applications!: Tables['applications']
  weeklyTargets!: Tables['weeklyTargets']
  deliverables!: Tables['deliverables']
  weeklyReviews!: Tables['weeklyReviews']
  timetableSlots!: Tables['timetableSlots']
  plannerDays!: Tables['plannerDays']
  plannerTasks!: Tables['plannerTasks']
  dailyQuotes!: Tables['dailyQuotes']
  contentPacks!: Tables['contentPacks']
  contentCards!: Tables['contentCards']
  packProgress!: Tables['packProgress']
  chatThreads!: Tables['chatThreads']
  chatMessages!: Tables['chatMessages']
  notes!: Tables['notes']
  noteBlocks!: Tables['noteBlocks']
  appSettings!: Tables['appSettings']
  portals!: Tables['portals']
  syncQueue!: Tables['syncQueue']
  syncMeta!: Tables['syncMeta']

  constructor(name = 'cadence') {
    super(name)
    this.version(SCHEMA_VERSION).stores({
      events: 'id, date, endDate, [type+date], [done+date], sourceModule, weekNumber, updatedAt',
      // unique (eventId, occurrenceDate): one annotation per occurrence. Soft-deleted rows are REVIVED, not duplicated.
      eventOccurrences: 'id, &[eventId+occurrenceDate], eventId, occurrenceDate, movedToDate, updatedAt',
      dailyLogs: 'id, &date, weekNumber, updatedAt',
      logBlocks: 'id, logId, date, track, updatedAt',
      dsaProblems: 'id, solvedDate, reviewDue, pattern, status, updatedAt',
      applications: 'id, status, appliedDate, nextFollowUp, updatedAt',
      weeklyTargets: 'id, &weekNumber',
      deliverables: 'id, weekNumber, dueDate',
      weeklyReviews: 'id, &weekNumber',
      timetableSlots: 'id, dayOfWeek, active',
      plannerDays: 'id, &date',
      plannerTasks: 'id, dayId, status, linkedEventId',
      dailyQuotes: 'id, date',
      contentPacks: 'id, weekNumber, track, source',
      contentCards: 'id, packId, [packId+orderIndex]',
      packProgress: 'id, packId, date',
      chatThreads: 'id, updatedAt',
      chatMessages: 'id, threadId',
      notes: 'id, linkType, linkId, updatedAt',
      noteBlocks: 'id, noteId, [noteId+orderIndex]',
      appSettings: 'id, &key',
      portals: 'id, category',
      // local-only (never synced, never exported)
      syncQueue: 'id, table, createdAt',
      syncMeta: 'key',
    })
  }
}

/** Every synced table, by name. */
export function syncedTable<T extends SyncTable>(db: CadenceDB, name: T): Tables[T] {
  return db[name] as Tables[T]
}

export let db = new CadenceDB()

/** Test seam: swap in a fresh database (fake-indexeddb) per test. */
export function resetDb(name = `cadence-test-${Math.random().toString(36).slice(2)}`): CadenceDB {
  db.close()
  db = new CadenceDB(name)
  return db
}

/** Test seam: make a specific instance the active one (simulate several devices in one process). */
export function setActiveDb(next: CadenceDB): CadenceDB {
  db = next
  return db
}
