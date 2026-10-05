import { describe, expect, it } from 'vitest'
import { FILTER_GROUPS, MAX_MARKERS, agendaFor, markersByDate, visibleTypes } from './calendar'
import { addDays } from './dates'
import { expandEvents } from './recurrence'
import { T0, mkEvent } from '@/test/factories'

const occ = (events: ReturnType<typeof mkEvent>[], from = T0, to = addDays(T0, 60)) => expandEvents(events, [], from, to)

describe('calendar markers', () => {
  it('shape by criticality: HARD bar, SOFT dot, INFO ring', () => {
    const m = markersByDate(occ([mkEvent({ criticality: 'HARD', date: addDays(T0, 30) }), mkEvent({ criticality: 'SOFT', date: addDays(T0, 31) }), mkEvent({ criticality: 'INFO', date: addDays(T0, 32) })]), T0, [])
    expect([30, 31, 32].map((n) => m.get(addDays(T0, n))!.markers[0]!.shape)).toEqual(['bar', 'dot', 'ring'])
  })
  it('colour ONLY for HARD-and-imminent: HARD within 14 days (not done) is imminent; far HARD, SOFT and INFO never are', () => {
    const m = markersByDate(
      occ([
        mkEvent({ criticality: 'HARD', date: addDays(T0, 13) }),
        mkEvent({ criticality: 'HARD', date: addDays(T0, 14) }),
        mkEvent({ criticality: 'SOFT', date: addDays(T0, 2) }),
        mkEvent({ criticality: 'INFO', date: addDays(T0, 3) }),
        mkEvent({ criticality: 'HARD', date: addDays(T0, 5), done: true }),
        mkEvent({ criticality: 'HARD', date: addDays(T0, -2) }),
      ], addDays(T0, -10)),
      T0,
      [],
    )
    const imminent = (n: number) => m.get(addDays(T0, n))?.markers[0]?.imminent
    expect([imminent(13), imminent(14), imminent(2), imminent(3), imminent(5), imminent(-2)]).toEqual([true, false, false, false, false, false])
  })
  it('study blocks are hidden by default (they would paint every weekday) and shown when selected', () => {
    const study = mkEvent({ type: 'STUDY_BLOCK', recurrence: 'DAILY', date: T0 })
    expect(markersByDate(occ([study]), T0, []).size).toBe(0)
    expect(markersByDate(occ([study]), T0, ['study']).size).toBeGreaterThan(30)
  })
  it('selecting groups shows ONLY those groups', () => {
    const evs = [mkEvent({ type: 'HACKATHON', date: T0 }), mkEvent({ type: 'HIRING_WINDOW', date: addDays(T0, 1) })]
    const m = markersByDate(occ(evs), T0, ['hackathons'])
    expect([...m.keys()]).toEqual([T0])
    expect(visibleTypes([]).has('STUDY_BLOCK')).toBe(false)
    expect(visibleTypes(['study']).has('STUDY_BLOCK')).toBe(true)
    expect(FILTER_GROUPS.flatMap((g) => g.types as readonly string[])).toHaveLength(7)
  })
  it('a long window is marked on the day it opens and the day it closes — not every day between', () => {
    const w = mkEvent({ type: 'HIRING_WINDOW', date: T0, endDate: addDays(T0, 20) })
    const m = markersByDate(occ([w]), T0, [])
    expect([...m.keys()].sort()).toEqual([T0, addDays(T0, 20)])
  })
  it('shows at most 3 markers per day (HARD first) and counts the rest', () => {
    const evs = ['INFO', 'SOFT', 'SOFT', 'HARD', 'INFO'].map((c) => mkEvent({ criticality: c as 'HARD', date: addDays(T0, 40) }))
    const cell = markersByDate(occ(evs), T0, []).get(addDays(T0, 40))!
    expect(cell.markers).toHaveLength(MAX_MARKERS)
    expect(cell.markers[0]!.shape).toBe('bar')
    expect(cell.extra).toBe(2)
  })
  it('the day agenda includes study blocks, ordered: untimed first, then HARD before SOFT, then by time', () => {
    const evs = [
      mkEvent({ title: 'soft-9', startTime: '09:00', criticality: 'SOFT' }),
      mkEvent({ title: 'untimed-soft', criticality: 'SOFT' }),
      mkEvent({ title: 'untimed-hard', criticality: 'HARD' }),
      mkEvent({ title: 'study', type: 'STUDY_BLOCK', startTime: '07:00' }),
    ]
    expect(agendaFor(occ(evs), T0).map((o) => o.title)).toEqual(['untimed-hard', 'untimed-soft', 'study', 'soft-9'])
    expect(agendaFor(occ(evs), addDays(T0, 1))).toEqual([])
  })
})
