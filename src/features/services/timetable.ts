import { addSlot, allSlots, removeSlot, replaceSlots, updateSlot } from '@/data/repos/timetable'
import { getSetting, setSetting, updateSetting } from '@/data/repos/settings'
import type { SlotLike } from '@/domain/timetable'
import { DEFAULT_LAYOUT, kindFor, type Layout, type Period } from '@/domain/timetable'

export const LAYOUT_KEY = 'timetableLayout'
export const SUBJECTS_KEY = 'timetableSubjects'
export const getLayout = () => getSetting<Layout>(LAYOUT_KEY, DEFAULT_LAYOUT)
export const saveLayout = (l: Layout) => setSetting(LAYOUT_KEY, l)
export const getSubjects = () => getSetting<string[]>(SUBJECTS_KEY, [])
export async function addSubject(name: string): Promise<string | null> {
  const n = name.trim().slice(0, 40)
  if (!n) return null
  const next = await updateSetting<string[]>(SUBJECTS_KEY, [], (cur) => (cur.some((s) => s.toLowerCase() === n.toLowerCase()) ? cur : [...cur, n]))
  return next.find((s) => s.toLowerCase() === n.toLowerCase()) ?? n
}

/** Paint mode: set (or, with null, erase) the subject in one cell. One write per tap. */
export async function paintCell(day: number, period: Period, subject: string | null): Promise<void> {
  const existing = (await allSlots()).find((s) => s.dayOfWeek === day && s.startTime === period.start)
  if (subject === null) {
    if (existing) await removeSlot(existing.id)
    return
  }
  if (existing) {
    if (existing.title !== subject) await updateSlot(existing.id, { title: subject, kind: kindFor(subject), endTime: period.end })
    return
  }
  await addSlot({ title: subject, dayOfWeek: day, startTime: period.start, endTime: period.end, kind: kindFor(subject), active: true, sourceImport: 'paint' })
}

/** Commit a REVIEWED import. `replace` swaps the whole timetable; `add` skips exact duplicates. */
export async function importSlots(slots: SlotLike[], mode: 'replace' | 'add', source: string): Promise<number> {
  const rows = slots.map((s) => ({ title: s.title, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, location: s.location, kind: s.kind ?? kindFor(s.title), active: true, sourceImport: source }))
  if (mode === 'replace') {
    await replaceSlots(rows)
    return rows.length
  }
  const have = new Set((await allSlots()).map((s) => `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.title.toLowerCase()}`))
  let n = 0
  for (const r of rows) {
    if (have.has(`${r.dayOfWeek}|${r.startTime}|${r.endTime}|${r.title.toLowerCase()}`)) continue
    await addSlot(r)
    n++
  }
  return n
}
