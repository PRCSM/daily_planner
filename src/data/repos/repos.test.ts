import { describe, expect, it } from 'vitest'
import { db } from '../db'
import * as Events from './events'
import * as Logs from './logs'
import * as Dsa from './dsa'
import * as Plan from './plan'
import * as Planner from './planner'
import * as Learn from './learn'
import * as Notes from './notes'
import * as Timetable from './timetable'
import { getSetting, setSetting } from './settings'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays, startOfWeek } from '@/domain/dates'
import { expandEvents } from '@/domain/recurrence'
import { validatePackObject } from '@/lib/packSchema'

freshDbPerTest()
const MON = startOfWeek(T0)

describe('events repo — one agenda bundle', () => {
  it('returns recurring events from an earlier anchor, spans overlapping the window, and nothing outside it', async () => {
    const weekly = await Events.createEvent({ title: 'weekly', type: 'STUDY_BLOCK', date: addDays(MON, -60), recurrence: 'WEEKLY', criticality: 'SOFT', sourceModule: 'PLAN' })
    const span = await Events.createEvent({ title: 'span', type: 'HIRING_WINDOW', date: addDays(MON, -5), endDate: addDays(MON, 2), recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'OPPORTUNITY' })
    await Events.createEvent({ title: 'past', type: 'CUSTOM', date: addDays(MON, -9), recurrence: 'NONE', criticality: 'INFO', sourceModule: 'CALENDAR' })
    await Events.createEvent({ title: 'future', type: 'CUSTOM', date: addDays(MON, 40), recurrence: 'NONE', criticality: 'INFO', sourceModule: 'CALENDAR' })
    const ended = await Events.createEvent({ title: 'ended', type: 'STUDY_BLOCK', date: addDays(MON, -60), endDate: addDays(MON, -30), recurrence: 'DAILY', criticality: 'SOFT', sourceModule: 'PLAN' })
    const { events } = await Events.getAgenda(MON, addDays(MON, 6))
    const ids = events.map((e) => e.id)
    expect(ids).toContain(weekly.id)
    expect(ids).toContain(span.id)
    expect(ids).not.toContain(ended.id)
    expect(events.map((e) => e.title).sort()).toEqual(['span', 'weekly'])
  })
  it('a MOVED annotation PLACES an occurrence in the window even when the event anchor is later than the window', async () => {
    const ev = await Events.createEvent({ title: 'review', type: 'STUDY_BLOCK', date: addDays(MON, 14), recurrence: 'WEEKLY', criticality: 'SOFT', sourceModule: 'PLAN' })
    await Events.annotateOccurrence(ev.id, addDays(MON, 14), { status: 'MOVED', movedToDate: addDays(MON, 2) })
    const { events, annotations } = await Events.getAgenda(MON, addDays(MON, 6))
    expect(events.map((e) => e.id)).toEqual([ev.id]) // fetched via the annotation, in the same transaction
    const occ = expandEvents(events, annotations, MON, addDays(MON, 6))
    expect(occ.map((o) => o.date)).toEqual([addDays(MON, 2)])
  })
  it('annotations are unique per (event,date); a cleared annotation is REVIVED, not duplicated', async () => {
    const ev = await Events.createEvent({ title: 'x', type: 'STUDY_BLOCK', date: MON, recurrence: 'DAILY', criticality: 'SOFT', sourceModule: 'PLAN' })
    const a1 = await Events.annotateOccurrence(ev.id, MON, { status: 'DONE', completedAt: 'x' })
    const a2 = await Events.annotateOccurrence(ev.id, MON, { status: 'SKIPPED' })
    expect(a2.id).toBe(a1.id)
    await Events.clearOccurrence(ev.id, MON)
    expect((await Events.getAgenda(MON, MON)).annotations).toHaveLength(0)
    const a3 = await Events.annotateOccurrence(ev.id, MON, { status: 'DONE' })
    expect(a3.id).toBe(a1.id)
    expect(a3.deletedAt).toBeNull()
    expect(await db.eventOccurrences.count()).toBe(1)
  })
  it('soft-deleted events leave the agenda', async () => {
    const ev = await Events.createEvent({ title: 'x', type: 'CUSTOM', date: MON, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    await Events.removeEvent(ev.id)
    expect((await Events.getAgenda(MON, MON)).events).toHaveLength(0)
    expect(await Events.listEvents()).toHaveLength(0)
  })
  it('listEventsByTypes uses the compound index', async () => {
    await Events.createEvent({ title: 'a', type: 'HACKATHON', date: MON, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'OPPORTUNITY' })
    await Events.createEvent({ title: 'b', type: 'CUSTOM', date: MON, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    expect((await Events.listEventsByTypes(['HACKATHON'])).map((e) => e.title)).toEqual(['a'])
    expect(await Events.listEventsByTypes([])).toEqual([])
  })
  it('setEventDone / updateEvent', async () => {
    const ev = await Events.createEvent({ title: 'a', type: 'CUSTOM', date: MON, recurrence: 'NONE', criticality: 'SOFT', sourceModule: 'CALENDAR' })
    expect((await Events.setEventDone(ev.id, true)).done).toBe(true)
    expect((await Events.updateEvent(ev.id, { title: 'b' })).title).toBe('b')
    expect((await Events.getEvent(ev.id))!.title).toBe('b')
  })
})

describe('logs repo', () => {
  const defaults = { weekNumber: 4, phase: 'GET_PRESENTABLE' } as const
  it('one log per date with a DETERMINISTIC id (two devices converge)', async () => {
    const a = await Logs.ensureLog(T0, defaults)
    const b = await Logs.ensureLog(T0, defaults)
    expect(b.id).toBe(a.id)
    expect(await db.dailyLogs.count()).toBe(1)
    const { detId } = await import('@/lib/ids')
    expect(a.id).toBe(detId('dailyLog', T0))
  })
  it('revives a soft-deleted log instead of colliding on the unique date index', async () => {
    const a = await Logs.ensureLog(T0, defaults)
    const { softDelete } = await import('../rows')
    await softDelete('dailyLogs', a.id)
    expect(await Logs.getLog(T0)).toBeUndefined()
    const again = await Logs.ensureLog(T0, defaults)
    expect(again.id).toBe(a.id)
    expect(again.deletedAt).toBeNull()
  })
  it('blocks round-trip, ordered by creation, soft-deleted ones hidden', async () => {
    const log = await Logs.ensureLog(T0, defaults)
    const mk = (topic: string, track: 'DSA' | 'GENAI' = 'DSA') => Logs.newBlock({ logId: log.id, date: T0, blockType: 'DEEP_A', track, minutes: 60, topic, aiUsed: false })
    const b1 = await Logs.addBlock(mk('one'))
    await Logs.addBlock(mk('two'))
    await Logs.removeBlock(b1.id)
    expect((await Logs.blocksForLog(log.id)).map((b) => b.topic)).toEqual(['two'])
  })
  it('range bundle is date-bounded and inclusive', async () => {
    for (const d of [addDays(T0, -1), T0, addDays(T0, 1), addDays(T0, 2)]) {
      const l = await Logs.ensureLog(d, defaults)
      await Logs.addBlock(Logs.newBlock({ logId: l.id, date: d, blockType: 'DEEP_A', track: 'DSA', minutes: 30, aiUsed: false }))
    }
    const r = await Logs.rangeBundle(T0, addDays(T0, 1))
    expect(r.logs.map((l) => l.date)).toEqual([T0, addDays(T0, 1)])
    expect(r.blocks).toHaveLength(2)
  })
  it('recent tracks / topics are newest-first and de-duplicated', async () => {
    const log = await Logs.ensureLog(T0, defaults)
    const { setClockSource, localDate } = await import('@/lib/clock')
    const add = async (track: 'DSA' | 'GENAI' | 'CORE_CS', topic: string, hh: string) => {
      setClockSource(() => localDate(T0, hh))
      await Logs.addBlock(Logs.newBlock({ logId: log.id, date: T0, blockType: 'DEEP_B', track, minutes: 30, topic, aiUsed: false }))
    }
    await add('DSA', 'Two pointers', '09:00')
    await add('GENAI', 'RAG', '10:00')
    await add('DSA', 'two pointers', '11:00')
    await add('CORE_CS', '   ', '12:00') // blank topics are not suggestions
    expect(await Logs.recentTracks()).toEqual(['CORE_CS', 'DSA', 'GENAI'])
    expect(await Logs.recentTopics()).toEqual([{ topic: 'two pointers', track: 'DSA' }, { topic: 'RAG', track: 'GENAI' }])
  })
  it('latestFuelBefore skips days where fuel was only a carried default', async () => {
    const d1 = await Logs.ensureLog(addDays(T0, -2), defaults)
    await Logs.patchLog(d1.id, { sleepHours: 6, fuelEntered: true })
    const d2 = await Logs.ensureLog(addDays(T0, -1), defaults)
    await Logs.patchLog(d2.id, { sleepHours: 9 }) // never confirmed
    expect((await Logs.latestFuelBefore(T0))!.sleepHours).toBe(6)
    expect(await Logs.latestFuelBefore(addDays(T0, -5))).toBeUndefined()
  })
})

describe('dsa repo — review queue', () => {
  const add = (title: string, reviewDue: string | null, solvedDate = T0) =>
    Dsa.addProblem({ title, source: 'LC', pattern: 'Arrays', difficulty: 'EASY', status: 'SOLVED_WITH_HINT', solvedDate, reviewDue, reviewCount: 0 })
  it('contains only problems due on/before today, oldest first; null is never due', async () => {
    await add('later', addDays(T0, 3))
    await add('due-today', T0)
    await add('overdue', addDays(T0, -4))
    await add('clean', null)
    const q = await Dsa.reviewQueue(T0)
    expect(q.map((p) => p.title)).toEqual(['overdue', 'due-today'])
  })
  it('is EMPTY (not a placeholder) when nothing is due', async () => {
    await add('later', addDays(T0, 3))
    expect(await Dsa.reviewQueue(T0)).toEqual([])
  })
  it('deleted problems leave the queue; problemsOnDate; allProblems newest first', async () => {
    const p = await add('x', T0)
    await add('y', null, addDays(T0, -1))
    expect((await Dsa.problemsOnDate(T0)).map((x) => x.title)).toEqual(['x'])
    expect((await Dsa.allProblems()).map((x) => x.title)).toEqual(['x', 'y'])
    await Dsa.removeProblem(p.id)
    expect(await Dsa.reviewQueue(T0)).toEqual([])
    await Dsa.updateProblem((await Dsa.allProblems())[0]!.id, { title: 'z' })
  })
})

describe('plan repo', () => {
  it('review: one per week, q5FuelOk defaults to NULL (unanswered) — never false', async () => {
    const r = await Plan.saveReview(4, { q1Dsa: 'ok' })
    expect(r.q5FuelOk).toBeNull()
    expect(r.burnoutFlag).toBe(false)
    const r2 = await Plan.saveReview(4, { q5FuelOk: false })
    expect(r2.id).toBe(r.id)
    expect(r2.q5FuelOk).toBe(false)
    const r3 = await Plan.saveReview(4, { q5FuelOk: null })
    expect(r3.q5FuelOk).toBeNull() // clearing returns to unanswered
    expect(await Plan.allReviews()).toHaveLength(1)
    expect((await Plan.getReview(4))!.q1Dsa).toBe('ok')
    expect(await Plan.getReview(5)).toBeUndefined()
  })
  it('deliverables', async () => {
    const d = await Plan.addDeliverable(3, 'ship it', T0)
    await Plan.setDeliverableDone(d.id, true)
    expect((await Plan.allDeliverables())[0]!.done).toBe(true)
    expect(await Plan.allWeeks()).toEqual([])
  })
})

describe('planner repo', () => {
  it('ensureDay is deterministic; tasks are ordered; day bundle in one transaction', async () => {
    const day = await Planner.ensureDay(T0)
    expect((await Planner.ensureDay(T0)).id).toBe(day.id)
    await Planner.setIntention(T0, 'ship the sheet')
    const mk = (title: string, orderIndex: number) => Planner.addTask({ dayId: day.id, title, priority: 'MUST', status: 'TODO', orderIndex })
    const b = await mk('b', 1)
    await mk('a', 0)
    const bundle = await Planner.dayBundle(T0)
    expect(bundle.day!.intention).toBe('ship the sheet')
    expect(bundle.tasks.map((t) => t.title)).toEqual(['a', 'b'])
    await Planner.updateTask(b.id, { status: 'DONE' })
    await Planner.removeTask(b.id)
    expect((await Planner.dayBundle(T0)).tasks).toHaveLength(1)
    expect((await Planner.dayBundle(addDays(T0, 1))).tasks).toEqual([])
    expect(await Planner.getDay(addDays(T0, 1))).toBeUndefined()
  })
})

describe('learn repo', () => {
  const pack = { title: 'T', summary: 'S', cards: ['HOOK', 'CONCEPT', 'SUMMARY'].map((type, i) => ({ orderIndex: i, type: type as 'HOOK', body: 'b' })) }
  it('savePack writes pack + cards atomically from a VALIDATED pack and queues them', async () => {
    const v = validatePackObject(pack)
    if (!v.ok) throw new Error('fixture invalid')
    const p = await Learn.savePack(v.pack, { topic: 't', tags: ['x'], source: 'AI_GENERATED' })
    expect(p.totalCards).toBe(3)
    expect(await Learn.cardsForPack(p.id)).toHaveLength(3)
    expect(await db.syncQueue.count()).toBe(4)
  })
  it('progress is one row per (pack,day)', async () => {
    const a = await Learn.saveProgress('p', T0, { cardsViewed: 1, cardsTotal: 8 })
    const b = await Learn.saveProgress('p', T0, { cardsViewed: 5 })
    expect(b.id).toBe(a.id)
    expect(b).toMatchObject({ cardsViewed: 5, cardsTotal: 8 })
    expect((await Learn.getProgress('p', T0))!.cardsViewed).toBe(5)
    expect(await Learn.getProgress('p', addDays(T0, 1))).toBeUndefined()
    expect(await Learn.allProgress()).toHaveLength(1)
  })
  it('chat threads sort by latest activity', async () => {
    const t1 = await Learn.createThread('one', 'GENERAL')
    const t2 = await Learn.createThread('two', 'PACK', 'p1', 'excerpt')
    const { setClockSource, localDate } = await import('@/lib/clock')
    setClockSource(() => localDate(addDays(T0, 1), '09:00'))
    await Learn.addMessage(t1.id, 'user', 'hi')
    expect((await Learn.allThreads()).map((t) => t.id)).toEqual([t1.id, t2.id])
    expect((await Learn.messagesFor(t1.id)).map((m) => m.content)).toEqual(['hi'])
    await Learn.removeThread(t2.id)
    expect(await Learn.allThreads()).toHaveLength(1)
  })
})

describe('notes / timetable / settings', () => {
  it('notes: create with a first block, link, update, search source data', async () => {
    const n = await Notes.createNote('Week 4 thoughts', 'WEEK', '4')
    const { note, blocks } = await Notes.getNote(n.id)
    expect(note!.title).toBe('Week 4 thoughts')
    expect(blocks).toHaveLength(1)
    await Notes.updateBlock(blocks[0]!.id, { text: 'hello' })
    expect((await Notes.notesLinkedTo('WEEK', '4')).map((x) => x.id)).toEqual([n.id])
    expect(await Notes.notesLinkedTo('WEEK', '5')).toEqual([])
    expect((await Notes.allNoteBlocks())[0]!.text).toBe('hello')
    await Notes.removeNote(n.id)
    expect((await Notes.getNote(n.id)).note).toBeUndefined()
    expect(await Notes.allNotes()).toEqual([])
  })
  it('timetable replaceSlots is atomic and soft-deletes the old set', async () => {
    const slot = (title: string) => ({ title, dayOfWeek: 1, startTime: '09:00', endTime: '10:00', kind: 'CLASS' as const, active: true })
    await Timetable.addSlot(slot('old'))
    await Timetable.replaceSlots([slot('a'), slot('b')])
    expect((await Timetable.allSlots()).map((s) => s.title).sort()).toEqual(['a', 'b'])
    expect(await db.timetableSlots.count()).toBe(3) // the old one is soft-deleted, so the deletion can sync
  })
  it('settings: get default, set, overwrite, one row per key', async () => {
    expect(await getSetting('k', 7)).toBe(7)
    await setSetting('k', 1)
    await setSetting('k', { a: 2 })
    expect(await getSetting('k', 0)).toEqual({ a: 2 })
    expect(await db.appSettings.count()).toBe(1)
  })
})
