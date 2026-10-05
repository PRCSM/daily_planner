import { describe, expect, it } from 'vitest'
import { FUEL_FALLBACK, fuelDefaults, orderTracks, topicSuggestions } from './log'
import { FOLLOW_UP_DAYS, daysSinceApplied, defaultFollowUp, isFollowUpDue } from './applications'
import { addDays } from './dates'
import { T0 } from '@/test/factories'

describe('log helpers', () => {
  it('fuel defaults carry yesterday’s ENTERED values; otherwise the neutral fallback', () => {
    expect(fuelDefaults(undefined)).toEqual(FUEL_FALLBACK)
    expect(fuelDefaults({ sleepHours: 5, trained: true, energy: 2, fuelEntered: false })).toEqual(FUEL_FALLBACK)
    expect(fuelDefaults({ sleepHours: 5, trained: true, energy: 2, fuelEntered: true })).toEqual({ sleepHours: 5, trained: true, energy: 2 })
    expect(fuelDefaults({ sleepHours: undefined, trained: false, energy: 4, fuelEntered: true }).sleepHours).toBe(FUEL_FALLBACK.sleepHours)
  })
  it('topic suggestions: same track first, prefix before substring, never the exact text already typed', () => {
    const hist = [{ topic: 'Sliding window', track: 'DSA' }, { topic: 'Window functions', track: 'CORE_CS' }, { topic: 'Two pointers', track: 'DSA' }, { topic: 'Binary search', track: 'DSA' }]
    expect(topicSuggestions(hist, '', 'DSA')).toEqual(['Sliding window', 'Two pointers', 'Binary search', 'Window functions'])
    expect(topicSuggestions(hist, 'win', 'DSA')).toEqual(['Sliding window', 'Window functions'])
    expect(topicSuggestions(hist, 'sliding window', 'DSA')).toEqual([])
    expect(topicSuggestions(hist, 'zzz', 'DSA')).toEqual([])
    expect(topicSuggestions(hist, '', 'DSA', 2)).toHaveLength(2)
  })
  it('tracks are ordered last-used first, then canonical', () => {
    expect(orderTracks(['A', 'B', 'C', 'D'] as const, ['C', 'A'])).toEqual(['C', 'A', 'B', 'D'])
    expect(orderTracks(['A', 'B'] as const, ['Z' as 'A'])).toEqual(['A', 'B'])
  })
})

describe('application helpers', () => {
  it('follow-up is a week after applying', () => {
    expect(FOLLOW_UP_DAYS).toBe(7)
    expect(defaultFollowUp(T0)).toBe(addDays(T0, 7))
  })
  it('follow-up due only for live applications', () => {
    expect(isFollowUpDue({ status: 'APPLIED', nextFollowUp: addDays(T0, -1) }, T0)).toBe(true)
    expect(isFollowUpDue({ status: 'APPLIED', nextFollowUp: addDays(T0, 1) }, T0)).toBe(false)
    expect(isFollowUpDue({ status: 'REJECTED', nextFollowUp: addDays(T0, -1) }, T0)).toBe(false)
    expect(isFollowUpDue({ status: 'APPLIED' }, T0)).toBe(false)
  })
  it('days since applied', () => {
    expect(daysSinceApplied({ appliedDate: addDays(T0, -5) }, T0)).toBe(5)
    expect(daysSinceApplied({}, T0)).toBeNull()
  })
})
