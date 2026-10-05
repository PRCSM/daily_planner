import { db } from '../db'
import { alive } from '../rows'
import type { Track } from '@/lib/enums'
import type { DailyLogRow, DeliverableRow, DsaProblemRow, EventOccurrenceRow, EventRow, LogBlockRow, PlannerDayRow, PlannerTaskRow, TimetableSlotRow, WeeklyReviewRow, WeeklyTargetRow } from '../types'

/**
 * Screen-shaped bundles: ONE Dexie transaction and a fixed number of indexed queries per screen —
 * never a query per row. Raw rows come back; pure domain functions shape them in render.
 */

export interface TodayBundle {
  weeks: WeeklyTargetRow[]
  events: EventRow[]
  annotations: EventOccurrenceRow[]
  log?: DailyLogRow
  blocks: LogBlockRow[]
  /** Dates (in the week strip) that have at least one logged block. */
  loggedDates: string[]
  reviewQueue: DsaProblemRow[]
  problems: DsaProblemRow[]
  deliverables: DeliverableRow[]
  /** Every date with a logged block — for the streak. */
  activeDates: string[]
}

/** [from,to] must cover the week strip AND the 14-day deadline horizon so one events query serves both. */
export async function getTodayBundle(date: string, from: string, to: string, today: string): Promise<TodayBundle> {
  return db.transaction('r', [db.weeklyTargets, db.events, db.eventOccurrences, db.dailyLogs, db.logBlocks, db.dsaProblems, db.deliverables], async () => {
    const weeks = alive(await db.weeklyTargets.orderBy('weekNumber').toArray())
    const candidates = alive(await db.events.where('date').belowOrEqual(to).toArray()).filter((e) => (e.recurrence === 'NONE' ? (e.endDate ?? e.date) >= from : !e.endDate || e.endDate >= from))
    const byDate = await db.eventOccurrences.where('occurrenceDate').between(from, to, true, true).toArray()
    const byMove = await db.eventOccurrences.where('movedToDate').between(from, to, true, true).toArray()
    const annotations = alive([...new Map([...byDate, ...byMove].map((a) => [a.id, a])).values()])
    const have = new Set(candidates.map((e) => e.id))
    const missing = [...new Set(annotations.map((a) => a.eventId))].filter((id) => !have.has(id))
    if (missing.length) for (const e of await db.events.bulkGet(missing)) if (e && !e.deletedAt) candidates.push(e)

    const log = (await db.dailyLogs.where('date').equals(date).first()) ?? undefined
    const stripBlocks = alive(await db.logBlocks.where('date').between(from, to, true, true).toArray())
    const blocks = stripBlocks.filter((b) => b.date === date)
    const problems = alive(await db.dsaProblems.toArray())
    const reviewQueue = problems.filter((p) => p.reviewDue !== null && p.reviewDue <= today).sort((a, b) => (a.reviewDue ?? '').localeCompare(b.reviewDue ?? ''))
    const deliverables = alive(await db.deliverables.toArray())
    const activeDates = (await db.logBlocks.orderBy('date').uniqueKeys()) as string[]
    return {
      weeks,
      events: candidates,
      annotations,
      log: log && !log.deletedAt ? log : undefined,
      blocks,
      loggedDates: [...new Set(stripBlocks.map((b) => b.date))],
      reviewQueue,
      problems,
      deliverables,
      activeDates,
    }
  })
}

export interface LogSheetBundle {
  weeks: WeeklyTargetRow[]
  log?: DailyLogRow
  blocks: LogBlockRow[]
  problems: DsaProblemRow[]
  recentTracks: Track[]
  recentTopics: { topic: string; track: Track }[]
  prevFuel?: DailyLogRow
  lastBlock?: LogBlockRow
}

export async function getLogSheetBundle(date: string): Promise<LogSheetBundle> {
  return db.transaction('r', [db.weeklyTargets, db.dailyLogs, db.logBlocks, db.dsaProblems], async () => {
    const weeks = alive(await db.weeklyTargets.orderBy('weekNumber').toArray())
    const rawLog = await db.dailyLogs.where('date').equals(date).first()
    const log = rawLog && !rawLog.deletedAt ? rawLog : undefined
    const blocks = alive(await db.logBlocks.where('date').equals(date).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const problems = alive(await db.dsaProblems.where('solvedDate').equals(date).toArray())
    const recent = alive(await db.logBlocks.orderBy('updatedAt').reverse().limit(200).toArray())
    const recentTracks: Track[] = []
    const seenTopics = new Set<string>()
    const recentTopics: { topic: string; track: Track }[] = []
    for (const r of recent) {
      if (!recentTracks.includes(r.track)) recentTracks.push(r.track)
      const t = r.topic?.trim()
      if (t && !seenTopics.has(`${r.track}|${t.toLowerCase()}`)) {
        seenTopics.add(`${r.track}|${t.toLowerCase()}`)
        recentTopics.push({ topic: t, track: r.track })
      }
    }
    const prevRows = alive(await db.dailyLogs.where('date').below(date).reverse().limit(14).toArray())
    return { weeks, log, blocks, problems, recentTracks, recentTopics, prevFuel: prevRows.find((l) => l.fuelEntered), lastBlock: recent[0] }
  })
}

export interface PlanBundle {
  weeks: WeeklyTargetRow[]
  problems: DsaProblemRow[]
  logs: DailyLogRow[]
  reviews: WeeklyReviewRow[]
  deliverables: DeliverableRow[]
}
export async function getPlanBundle(): Promise<PlanBundle> {
  return db.transaction('r', [db.weeklyTargets, db.dsaProblems, db.dailyLogs, db.weeklyReviews, db.deliverables], async () => ({
    weeks: alive(await db.weeklyTargets.orderBy('weekNumber').toArray()),
    problems: alive(await db.dsaProblems.toArray()),
    logs: alive(await db.dailyLogs.toArray()),
    reviews: alive(await db.weeklyReviews.orderBy('weekNumber').toArray()),
    deliverables: alive(await db.deliverables.toArray()),
  }))
}

export interface PlannerBundle {
  day?: PlannerDayRow
  tasks: PlannerTaskRow[]
  slots: TimetableSlotRow[]
  events: EventRow[]
  annotations: EventOccurrenceRow[]
}
/** The planner day in one transaction: the day + its tasks, the timetable barriers, and that date's plan occurrences. */
export async function getPlannerBundle(date: string): Promise<PlannerBundle> {
  return db.transaction('r', [db.plannerDays, db.plannerTasks, db.timetableSlots, db.events, db.eventOccurrences], async () => {
    const d = await db.plannerDays.where('date').equals(date).first()
    const day = d && !d.deletedAt ? d : undefined
    const tasks = day ? alive(await db.plannerTasks.where('dayId').equals(day.id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex) : []
    const slots = alive(await db.timetableSlots.toArray())
    const candidates = alive(await db.events.where('date').belowOrEqual(date).toArray()).filter((e) => (e.recurrence === 'NONE' ? (e.endDate ?? e.date) >= date : !e.endDate || e.endDate >= date))
    const byDate = alive(await db.eventOccurrences.where('occurrenceDate').equals(date).toArray())
    const byMove = alive(await db.eventOccurrences.where('movedToDate').equals(date).toArray())
    const annotations = [...new Map([...byDate, ...byMove].map((a) => [a.id, a])).values()]
    const have = new Set(candidates.map((e) => e.id))
    const missing = annotations.map((a) => a.eventId).filter((id) => !have.has(id))
    if (missing.length) for (const e of await db.events.bulkGet(missing)) if (e && !e.deletedAt) candidates.push(e)
    return { day, tasks, slots, events: candidates, annotations }
  })
}

export interface ProgressBundle {
  weeks: WeeklyTargetRow[]
  problems: DsaProblemRow[]
  logs: DailyLogRow[]
  blocks: LogBlockRow[]
}
export async function getProgressBundle(): Promise<ProgressBundle> {
  return db.transaction('r', [db.weeklyTargets, db.dsaProblems, db.dailyLogs, db.logBlocks], async () => ({
    weeks: alive(await db.weeklyTargets.orderBy('weekNumber').toArray()),
    problems: alive(await db.dsaProblems.toArray()),
    logs: alive(await db.dailyLogs.toArray()),
    blocks: alive(await db.logBlocks.toArray()),
  }))
}
