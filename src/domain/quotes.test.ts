import { describe, expect, it } from 'vitest'
import type { ContentPackRow, DailyQuoteRow } from '@/data/types'
import { addDays } from './dates'
import { packForWeek, quoteForDate } from './quotes'
import { T0 } from '@/test/factories'

const q = (id: string): DailyQuoteRow => ({ id, createdAt: '', updatedAt: '', deletedAt: null, syncedAt: null, text: id, source: 's', saved: false, seeded: true, userModified: false })
const pk = (id: string, tags: string[], weekNumber?: number): ContentPackRow => ({ id, createdAt: '', updatedAt: '', deletedAt: null, syncedAt: null, title: id, topic: id, summary: '', tags, weekNumber, source: 'SEEDED', totalCards: 8, estimatedMinutes: 5, seeded: true, userModified: false })

describe('quoteForDate', () => {
  const quotes = ['c', 'a', 'b', 'd'].map(q)
  it('is deterministic: same date → same quote, regardless of input order', () => {
    expect(quoteForDate(quotes, T0)).toEqual(quoteForDate([...quotes].reverse(), T0))
  })
  it('cycles through every quote before repeating', () => {
    const seen = new Set(Array.from({ length: 4 }, (_, i) => quoteForDate(quotes, addDays(T0, i))!.id))
    expect(seen.size).toBe(4)
    expect(quoteForDate(quotes, addDays(T0, 4))!.id).toBe(quoteForDate(quotes, T0)!.id)
  })
  it('works for dates before the epoch and with no quotes', () => {
    expect(quoteForDate(quotes, '1999-01-01')).toBeDefined()
    expect(quoteForDate([], T0)).toBeUndefined()
    expect(quoteForDate([{ ...q('x'), deletedAt: 'x' }], T0)).toBeUndefined()
  })
})

describe('packForWeek', () => {
  const packs = [pk('closures', ['javascript', 'closures'], 1), pk('two-pointers', ['two pointers', 'arrays'], 2), pk('btree', ['dbms'], 4)]
  it('picks the pack whose tags best overlap this week’s topics', () => {
    expect(packForWeek(packs, ['Arrays', 'Two Pointers'], 2, new Set())?.id).toBe('two-pointers')
  })
  it('skips finished packs when something else matches', () => {
    const p = [pk('a', ['arrays'], 2), pk('b', ['arrays'], 2)]
    expect(packForWeek(p, ['arrays'], 2, new Set(['a']))?.id).toBe('b')
  })
  it('no overlap → no recommendation (not a feed)', () => {
    expect(packForWeek(packs, ['graphs'], 12, new Set())).toBeUndefined()
  })
  it('a pack finished and with no alternative is not re-served', () => {
    expect(packForWeek([pk('a', ['arrays'], 2)], ['arrays'], 2, new Set(['a']))).toBeUndefined()
  })
  it('breaks ties by exact week then title', () => {
    const p = [pk('z', ['arrays'], 2), pk('a', ['arrays'], 3)]
    expect(packForWeek(p, ['arrays'], 2, new Set())?.id).toBe('z')
  })
})
