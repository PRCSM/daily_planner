import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getPlanBundle } from '@/data/repos/bundles'
import { burnoutActive } from '@/domain/burnout'
import { dsaDoneInRange, dsaDoneTotal, dsaTargetTotal, weekVerdict, type WeekVerdict } from '@/domain/progress'
import { weekFor, weekState, type WeekPhaseState } from '@/domain/weeks'
import type { WeeklyTargetRow } from '@/data/types'

export interface WeekRow {
  week: WeeklyTargetRow
  state: WeekPhaseState
  dsa: WeekVerdict
  apps: WeekVerdict
}

export function usePlan(today: string) {
  const data = useLiveQuery(() => getPlanBundle(), [])
  return useMemo(() => {
    if (!data) return null
    const rows: WeekRow[] = data.weeks.map((week) => {
      const dsaActual = dsaDoneInRange(data.problems, week.startDate, week.endDate)
      const appsActual = data.logs.filter((l) => l.date >= week.startDate && l.date <= week.endDate).reduce((n, l) => n + l.applicationsSent, 0)
      return {
        week,
        state: weekState(week, today),
        dsa: weekVerdict(week, week.dsaTarget, dsaActual, today),
        apps: weekVerdict(week, week.applicationTarget, appsActual, today),
      }
    })
    const current = weekFor(data.weeks, today)
    return {
      rows,
      current,
      reviews: data.reviews,
      deliverables: data.deliverables,
      burnout: current ? burnoutActive(data.reviews, current.weekNumber) : false,
      totalDone: dsaDoneTotal(data.problems),
      totalTarget: dsaTargetTotal(data.weeks),
    }
  }, [data, today])
}
