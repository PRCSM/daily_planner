import { durationMinutes, fromMinutes, snapMinutes, toMinutes } from './dates'
import type { SlotLike } from './timetable'

/** The planner day runs 06:00–23:00. Timetable slots are IMMOVABLE barriers; tasks may overlap each other. */
export const DAY_START = 6 * 60
export const DAY_END = 23 * 60
export const SNAP = 15
export const MIN_TASK = 15
export const HOUR_PX = 64

export interface Interval {
  start: number // minutes since midnight
  end: number
}
export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end

export interface Barrier {
  title: string
  startTime: string
  endTime: string
}

/** The first timetable slot this interval collides with, or null. Touching edges don't collide. */
export function findBarrier<T extends Barrier>(slots: T[], iv: Interval): T | null {
  for (const s of [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    if (overlaps(iv, { start: toMinutes(s.startTime), end: toMinutes(s.endTime) })) return s
  }
  return null
}

export const slotsOnDay = <T extends SlotLike>(slots: T[], dayOfWeek: number): T[] => slots.filter((s) => s.active !== false && s.dayOfWeek === dayOfWeek)

export const barrierMessage = (b: Barrier): string => `That overlaps ${b.title} (${b.startTime}–${b.endTime}).`

export type DragMode = 'move' | 'resize'
export interface DragOutcome {
  start: string
  end: string
  /** Set when the drop hit a timetable slot — the caller springs the block back and names it. */
  collision: Barrier | null
  changed: boolean
}

/**
 * Apply a drag of `deltaMinutes` to a task. Snaps to 15 min, clamps to the day, keeps ≥15 min, and refuses
 * (springs back) when the result would overlap a timetable slot. Task-on-task overlap is allowed.
 */
export function applyDrag(task: { start: string; end: string }, mode: DragMode, deltaMinutes: number, barriers: Barrier[]): DragOutcome {
  const s0 = toMinutes(task.start)
  const e0 = toMinutes(task.end)
  const len = e0 - s0
  let s = s0
  let e: number
  if (mode === 'move') {
    s = snapMinutes(s0 + deltaMinutes, SNAP)
    s = Math.max(DAY_START, Math.min(DAY_END - len, s))
    e = s + len
  } else {
    e = snapMinutes(e0 + deltaMinutes, SNAP)
    e = Math.max(s0 + MIN_TASK, Math.min(DAY_END, e))
  }
  const start = fromMinutes(s)
  const end = fromMinutes(e)
  const collision = findBarrier(barriers, { start: s, end: e })
  return { start: collision ? task.start : start, end: collision ? task.end : end, collision, changed: !collision && (s !== s0 || e !== e0) }
}

export interface Placed {
  id: string
  col: number
  cols: number
}
/**
 * Side-by-side columns for overlapping tasks (intent can overlap). Tasks that transitively overlap share
 * a cluster; within it each task takes the first free column and all share the cluster's column count.
 */
export function layoutColumns(tasks: { id: string; start: string; end: string }[]): Map<string, Placed> {
  const items = tasks
    .map((t) => ({ id: t.id, s: toMinutes(t.start), e: Math.max(toMinutes(t.end), toMinutes(t.start) + MIN_TASK) }))
    .sort((a, b) => a.s - b.s || a.e - b.e || a.id.localeCompare(b.id))
  const out = new Map<string, Placed>()
  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => {
    const colEnds: number[] = []
    const assigned: { id: string; col: number }[] = []
    for (const it of cluster) {
      let col = colEnds.findIndex((end) => end <= it.s)
      if (col === -1) col = colEnds.length
      colEnds[col] = it.e
      assigned.push({ id: it.id, col })
    }
    for (const a of assigned) out.set(a.id, { id: a.id, col: a.col, cols: colEnds.length })
    cluster = []
    clusterEnd = -1
  }
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.e)
  }
  if (cluster.length) flush()
  return out
}

/** CSS geometry for an interval on the 06:00-based timeline. */
export const geometry = (start: string, end: string, hourPx = HOUR_PX): { top: number; height: number } => ({
  top: ((toMinutes(start) - DAY_START) / 60) * hourPx,
  height: Math.max((MIN_TASK / 60) * hourPx, (durationMinutes(start, end) / 60) * hourPx),
})

/** y offset (px, relative to the timeline top) → minutes since midnight, snapped. */
export const minutesAtY = (y: number, hourPx = HOUR_PX): number => Math.max(DAY_START, Math.min(DAY_END - MIN_TASK, snapMinutes(DAY_START + (y / hourPx) * 60, SNAP)))
