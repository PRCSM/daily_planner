import { describe, expect, it } from 'vitest'
import { burnoutActive, burnoutFlagFor, reducedTarget } from './burnout'
import { mkReview } from '@/test/factories'

describe('burnout (q5FuelOk is TRI-STATE)', () => {
  it('two consecutive explicit false → flagged on the second', () => {
    const r = [mkReview(3, false), mkReview(4, false)]
    expect(burnoutFlagFor(r, 3)).toBe(false)
    expect(burnoutFlagFor(r, 4)).toBe(true)
  })
  it('false → null → false does NOT flag (null breaks the run)', () => {
    const r = [mkReview(3, false), mkReview(4, null), mkReview(5, false)]
    for (const w of [3, 4, 5]) expect(burnoutFlagFor(r, w)).toBe(false)
  })
  it('a MISSING review breaks the run just like null', () => {
    const r = [mkReview(3, false), mkReview(5, false)]
    expect(burnoutFlagFor(r, 5)).toBe(false)
  })
  it('true breaks the run', () => {
    expect(burnoutFlagFor([mkReview(3, false), mkReview(4, true), mkReview(5, false)], 5)).toBe(false)
  })
  it('three in a row keeps flagging', () => {
    const r = [mkReview(3, false), mkReview(4, false), mkReview(5, false)]
    expect([3, 4, 5].map((w) => burnoutFlagFor(r, w))).toEqual([false, true, true])
  })
  it('a single false never flags; null/null never flags', () => {
    expect(burnoutFlagFor([mkReview(1, false)], 1)).toBe(false)
    expect(burnoutFlagFor([mkReview(1, null), mkReview(2, null)], 2)).toBe(false)
  })
  it('card is non-dismissible: shows in the week after a flag until that week answers an explicit yes', () => {
    const r = [mkReview(3, false), mkReview(4, false)]
    expect(burnoutActive(r, 4)).toBe(true) // the Sunday of the flagging review
    expect(burnoutActive(r, 5)).toBe(true) // "this week" — cut the plan
    expect(burnoutActive([...r, mkReview(5, null)], 5)).toBe(true)
    expect(burnoutActive([...r, mkReview(5, true)], 5)).toBe(false)
    expect(burnoutActive(r, 6)).toBe(false) // a week later with no new bad answer, it lapses
  })
  it('reduced target is 75%, rounded, never below 1 when there was a target', () => {
    expect(reducedTarget(20)).toBe(15)
    expect(reducedTarget(3)).toBe(2)
    expect(reducedTarget(1)).toBe(1)
    expect(reducedTarget(0)).toBe(0)
  })
})
