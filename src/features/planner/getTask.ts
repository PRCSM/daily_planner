import { dayBundle } from '@/data/repos/planner'

/** One task of a planner day, via the day bundle (the task sheet knows the date it was opened from). */
export async function getTask(id: string, date: string) {
  return (await dayBundle(date)).tasks.find((t) => t.id === id)
}
