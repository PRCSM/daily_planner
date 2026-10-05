import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProgressBundle } from '@/data/repos/bundles'
import { aiFreeLearningPct, isAiViolation } from '@/domain/aiOff'
import { applicationsPerWeek, dsaBurnUp, dsaDoneTotal, dsaTargetTotal, minutesByTrackPerWeek, sleepSeries } from '@/domain/progress'
import { currentStreak, longestStreak } from '@/domain/streak'
import { weekFor } from '@/domain/weeks'

export function useProgress(today: string) {
  const data = useLiveQuery(() => getProgressBundle(), [])
  return useMemo(() => {
    if (!data) return null
    const current = weekFor(data.weeks, today)
    const weekBlocks = current ? data.blocks.filter((b) => b.date >= current.startDate && b.date <= current.endDate) : []
    const minutesByDate = new Map<string, number>()
    for (const b of data.blocks) minutesByDate.set(b.date, (minutesByDate.get(b.date) ?? 0) + b.minutes)
    const active = new Set(minutesByDate.keys())
    return {
      ...data,
      current,
      burnUp: dsaBurnUp(data.weeks, data.problems, today),
      target: dsaTargetTotal(data.weeks),
      done: dsaDoneTotal(data.problems),
      minutes: minutesByTrackPerWeek(data.weeks, data.blocks),
      apps: applicationsPerWeek(data.weeks, data.logs),
      sleep: sleepSeries(data.logs),
      minutesByDate,
      streak: currentStreak(active, today),
      longest: longestStreak(active),
      aiPctWeek: aiFreeLearningPct(weekBlocks),
      aiPctAll: aiFreeLearningPct(data.blocks),
      aiFlagged: weekBlocks.filter(isAiViolation),
    }
  }, [data, today])
}
