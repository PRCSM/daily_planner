import { describe, expect, it } from 'vitest'
import { addDays, startOfWeek } from './dates'
import { currentStreak, heatLevel, heatmap, longestStreak } from './streak'
import { T0 } from '@/test/factories'

const days = (...offsets: number[]) => new Set(offsets.map((o) => addDays(T0, o)))

describe('streak', () => {
  it('counts back from today when today is active', () => {
    expect(currentStreak(days(0, -1, -2), T0)).toBe(3)
  })
  it('counts back from yesterday when today has nothing yet (the day is not over)', () => {
    expect(currentStreak(days(-1, -2, -3), T0)).toBe(3)
  })
  it('a missed day yesterday means 0 — just 0, no shaming', () => {
    expect(currentStreak(days(-2, -3), T0)).toBe(0)
    expect(currentStreak(new Set(), T0)).toBe(0)
  })
  it('a gap ends the run', () => {
    expect(currentStreak(days(0, -1, -3, -4, -5), T0)).toBe(2)
  })
  it('longest streak', () => {
    expect(longestStreak(new Set())).toBe(0)
    expect(longestStreak(days(0))).toBe(1)
    expect(longestStreak(days(0, 1, 2, 5, 6, 7, 8, 9, 20))).toBe(5)
  })
  it('heat levels use fixed thresholds (never relative to the user’s own best day)', () => {
    expect([0, 1, 44, 45, 119, 120, 239, 240, 999].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
  it('heatmap: weeks × 7, Monday-first, ends with the current week, marks the future', () => {
    const grid = heatmap(new Map([[T0, 130]]), T0, 6, startOfWeek)
    expect(grid).toHaveLength(6)
    expect(grid.every((c) => c.length === 7)).toBe(true)
    expect(grid[5]![0]!.date).toBe(startOfWeek(T0))
    const cell = grid.flat().find((c) => c.date === T0)!
    expect(cell).toMatchObject({ minutes: 130, level: 3, future: false })
    expect(grid[5]![6]!.future).toBe(true)
  })
})
