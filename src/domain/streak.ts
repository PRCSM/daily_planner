import { addDays, diffDays, eachDay } from './dates'
import type { DateStr } from './dates'

/**
 * Streak = consecutive days with at least one block logged. If today has nothing yet, the streak
 * is counted back from yesterday (the day isn't over, so it isn't broken). No shaming: a broken
 * streak is just 0.
 */
export function currentStreak(activeDays: ReadonlySet<DateStr>, today: DateStr): number {
  let d = activeDays.has(today) ? today : addDays(today, -1)
  let n = 0
  while (activeDays.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function longestStreak(activeDays: ReadonlySet<DateStr>): number {
  const sorted = [...activeDays].sort()
  let best = 0
  let run = 0
  let prev: DateStr | null = null
  for (const d of sorted) {
    run = prev !== null && diffDays(prev, d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

/** Fixed thresholds (NOT relative to the user's own max — that would fabricate a "good" day). */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0
  if (minutes < 45) return 1
  if (minutes < 120) return 2
  if (minutes < 240) return 3
  return 4
}

export interface HeatCell {
  date: DateStr
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}
/** GitHub-style grid: columns are Mon-start weeks ending with the week containing `today`. Returns weeks × 7. */
export function heatmap(minutesByDate: ReadonlyMap<DateStr, number>, today: DateStr, weeks = 20, weekStart: (d: DateStr) => DateStr): HeatCell[][] {
  const lastMonday = weekStart(today)
  const first = addDays(lastMonday, -7 * (weeks - 1))
  const cols: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(first, w * 7)
    cols.push(
      eachDay(monday, addDays(monday, 6)).map((date) => {
        const minutes = minutesByDate.get(date) ?? 0
        return { date, minutes, level: heatLevel(minutes), future: date > today }
      }),
    )
  }
  return cols
}
