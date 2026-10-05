import { addTask, ensureDay, removeTask, updateTask } from '@/data/repos/planner'
import { dayBundle } from '@/data/repos/planner'
import { allSlots } from '@/data/repos/timetable'
import type { PlannerTaskRow } from '@/data/types'
import type { Priority, TaskStatus, Track } from '@/lib/enums'
import { addDays, dayOfWeek, isValidTime, toMinutes } from '@/domain/dates'
import { barrierMessage, findBarrier, slotsOnDay, type Barrier } from '@/domain/planner'

export interface TaskInput {
  date: string
  title: string
  startTime?: string
  endTime?: string
  priority: Priority
  track?: Track
  notes?: string
  linkedEventId?: string
}
export type TaskResult = { ok: true; task: PlannerTaskRow } | { ok: false; reason: string; barrier?: Barrier }

/** Timetable slots are IMMOVABLE: a timed task that overlaps one is refused and the slot is named. */
async function checkTimes(date: string, start?: string, end?: string): Promise<TaskResult | null> {
  if (!start && !end) return null
  if (!start || !end) return { ok: false, reason: 'Give both a start and an end, or neither.' }
  if (!isValidTime(start) || !isValidTime(end)) return { ok: false, reason: 'Times must look like 09:30.' }
  if (toMinutes(end) <= toMinutes(start)) return { ok: false, reason: 'The end must be after the start.' }
  const barrier = findBarrier(slotsOnDay(await allSlots(), dayOfWeek(date)), { start: toMinutes(start), end: toMinutes(end) })
  return barrier ? { ok: false, reason: barrierMessage(barrier), barrier } : null
}

export async function addPlannerTask(input: TaskInput): Promise<TaskResult> {
  const title = input.title.trim()
  if (!title) return { ok: false, reason: 'Give the task a title.' }
  const bad = await checkTimes(input.date, input.startTime, input.endTime)
  if (bad) return bad
  const day = await ensureDay(input.date)
  const { tasks } = await dayBundle(input.date)
  const task = await addTask({
    dayId: day.id, title, startTime: input.startTime, endTime: input.endTime, priority: input.priority, status: 'TODO',
    notes: input.notes?.trim() || undefined, linkedEventId: input.linkedEventId, track: input.track, orderIndex: tasks.length,
  })
  return { ok: true, task }
}

export async function editPlannerTask(id: string, date: string, patch: Partial<Pick<PlannerTaskRow, 'title' | 'startTime' | 'endTime' | 'priority' | 'track' | 'notes' | 'status'>>): Promise<TaskResult> {
  const hasTimes = 'startTime' in patch || 'endTime' in patch
  if (hasTimes) {
    const bad = await checkTimes(date, patch.startTime, patch.endTime)
    if (bad) return bad
  }
  if (patch.title !== undefined && !patch.title.trim()) return { ok: false, reason: 'Give the task a title.' }
  return { ok: true, task: await updateTask(id, patch) }
}

export const setTaskStatus = (id: string, status: TaskStatus) => updateTask(id, { status })
export const deleteTask = (id: string) => removeTask(id)

/** Carry an unfinished task forward: the original is marked MOVED, a fresh UNTIMED copy lands on `toDate`. */
export async function moveTaskForward(task: PlannerTaskRow, toDate: string): Promise<PlannerTaskRow> {
  await updateTask(task.id, { status: 'MOVED' })
  const r = await addPlannerTask({ date: toDate, title: task.title, priority: task.priority, track: task.track, notes: task.notes, linkedEventId: task.linkedEventId })
  if (!r.ok) throw new Error(r.reason)
  return r.task
}

export const tomorrowOf = (date: string): string => addDays(date, 1)
