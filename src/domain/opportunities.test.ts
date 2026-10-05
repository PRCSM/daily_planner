import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { effectiveFit, groupOpportunities, isOpportunity } from './opportunities'
import { T0, mkEvent } from '@/test/factories'

const opp = (o: Parameters<typeof mkEvent>[0]) => mkEvent({ type: 'HIRING_WINDOW', fitPill: 'GOOD', ...o })

describe('opportunities', () => {
  it('only dated opportunity types with a fit pill qualify', () => {
    expect(isOpportunity(opp({}))).toBe(true)
    expect(isOpportunity(mkEvent({ type: 'CUSTOM', fitPill: 'GOOD' }))).toBe(false)
    expect(isOpportunity(mkEvent({ type: 'HACKATHON' }))).toBe(false)
  })
  it('CLOSED is derived once the window has ended (endDate wins over date)', () => {
    expect(effectiveFit(opp({ date: addDays(T0, -10), endDate: addDays(T0, 3) }), T0)).toBe('GOOD')
    expect(effectiveFit(opp({ date: addDays(T0, -10), endDate: addDays(T0, -1) }), T0)).toBe('CLOSED')
    expect(effectiveFit(opp({ date: addDays(T0, -1) }), T0)).toBe('CLOSED')
    expect(effectiveFit(opp({ date: T0 }), T0)).toBe('GOOD')
    expect(effectiveFit(opp({ fitPill: 'CLOSED', date: addDays(T0, 30) }), T0)).toBe('CLOSED')
  })
  it('an identical caveat is rendered ONCE above its group; a unique one stays inline', () => {
    const shared = 'Not your target — you graduate mid-2027.'
    const evs = [
      opp({ id: 'a', title: 'A', date: addDays(T0, 5), caveat: shared }),
      opp({ id: 'b', title: 'B', date: addDays(T0, 2), caveat: shared }),
      opp({ id: 'c', title: 'C', date: addDays(T0, 3), caveat: 'Only this one.' }),
      opp({ id: 'd', title: 'D', date: addDays(T0, 4), caveat: `  ${shared}  ` }), // whitespace-insensitive
    ]
    const [m] = groupOpportunities(evs, T0)
    const groups = m!.groups
    const sharedGroups = groups.filter((g) => g.sharedCaveat)
    expect(sharedGroups).toHaveLength(1)
    expect(sharedGroups[0]!.rows.map((r) => r.event.id)).toEqual(['b', 'd', 'a']) // sorted by date
    expect(groups.filter((g) => !g.sharedCaveat)[0]!.rows[0]!.event.id).toBe('c')
    // group is positioned by its EARLIEST member (b @ +2) → before c @ +3
    expect(groups[0]!.sharedCaveat).toBe(shared)
  })
  it('a lone row with a caveat is not a group', () => {
    const [m] = groupOpportunities([opp({ caveat: 'x', date: addDays(T0, 1) })], T0)
    expect(m!.groups[0]!.sharedCaveat).toBeUndefined()
  })
  it('CLOSED rows sink to the bottom of their month but never disappear', () => {
    const evs = [
      opp({ id: 'old', title: 'old', date: '2026-09-02', endDate: '2026-09-03' }),
      opp({ id: 'mid', title: 'mid', date: '2026-09-15' }),
      opp({ id: 'late', title: 'late', date: '2026-09-25' }),
    ]
    const [m] = groupOpportunities(evs, '2026-09-10')
    const rows = m!.groups.flatMap((g) => g.rows)
    expect(rows.map((r) => r.event.id)).toEqual(['mid', 'late', 'old'])
    expect(rows.map((r) => r.closed)).toEqual([false, false, true])
  })
  it('months are chronological with labels', () => {
    const sections = groupOpportunities([opp({ date: '2026-09-10' }), opp({ date: '2026-08-20' })], '2026-01-01')
    expect(sections.map((s) => s.key)).toEqual(['2026-08', '2026-09'])
    expect(sections[0]!.label).toBe('August 2026')
  })
  it('deleted events are dropped', () => {
    expect(groupOpportunities([{ ...opp({}), deletedAt: 'x' }], T0)).toEqual([])
  })
})
