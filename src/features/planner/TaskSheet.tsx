import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from '@/ui/Sheet'
import { Button } from '@/ui/primitives'
import { ChipGroup, Field, FieldGroup, TextArea, TextField } from '@/ui/controls'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { addPlannerTask, deleteTask, editPlannerTask } from '@/features/services/planner'
import { PRIORITIES, TASK_STATUSES, TRACKS, TRACK_LABEL, type Priority, type TaskStatus, type Track } from '@/lib/enums'
import { getTask } from './getTask'

export interface TaskSheetPayload {
  id?: string
  /** The planner day this task belongs to. */
  date?: string
  start?: string
  end?: string
  /** Pre-filled title (e.g. from an event). */
  title?: string
  linkedEventId?: string
}

/** Add or edit a planner task. Timed tasks that overlap a timetable slot are refused, naming the slot. */
export function TaskSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.closeSheet)
  const open = sheet.name === 'task'
  const payload = (sheet.payload ?? {}) as TaskSheetPayload
  const today = useToday()
  const date = payload.date ?? today
  const editing = payload.id

  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [priority, setPriority] = useState<Priority>('SHOULD')
  const [track, setTrack] = useState<Track | null>(null)
  const [status, setStatus] = useState<TaskStatus>('TODO')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const existing = useLiveQuery(() => (editing ? getTask(editing, date) : undefined), [editing, date])

  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      if (!existing) return
      setTitle(existing.title)
      setStart(existing.startTime ?? '')
      setEnd(existing.endTime ?? '')
      setPriority(existing.priority)
      setTrack(existing.track ?? null)
      setStatus(existing.status)
      setNotes(existing.notes ?? '')
    } else {
      setTitle(payload.title ?? '')
      setStart(payload.start ?? '')
      setEnd(payload.end ?? '')
      setPriority('SHOULD')
      setTrack(null)
      setStatus('TODO')
      setNotes('')
    }
  }, [open, editing, existing, payload.title, payload.start, payload.end])

  async function save() {
    const times = { startTime: start || undefined, endTime: end || undefined }
    const res = editing
      ? await editPlannerTask(editing, date, { title, ...times, priority, track: track ?? undefined, status, notes: notes.trim() || undefined })
      : await addPlannerTask({ date, title, ...times, priority, track: track ?? undefined, notes, linkedEventId: payload.linkedEventId })
    if (!res.ok) return setError(res.reason)
    close()
  }

  return (
    <Sheet open={open} onClose={close} title={editing ? 'Edit task' : 'Add task'} testId="task-sheet">
      <div className="flex flex-col gap-4">
        <Field label="Task">
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finish the URL-shortener design doc" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start (optional)">
            <TextField type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" />
          </Field>
          <Field label="End">
            <TextField type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time" />
          </Field>
        </div>
        <FieldGroup label="Priority">
          <ChipGroup label="Priority" options={PRIORITIES} value={priority} onChange={setPriority} render={(p) => p[0] + p.slice(1).toLowerCase()} />
        </FieldGroup>
        <FieldGroup label="Counts toward (pre-fills the log when you finish)">
          <ChipGroup label="Track" options={TRACKS} value={track} onChange={setTrack} render={(t) => TRACK_LABEL[t]} />
        </FieldGroup>
        {editing ? (
          <FieldGroup label="Status">
            <ChipGroup label="Status" options={TASK_STATUSES} value={status} onChange={setStatus} render={(s) => s[0] + s.slice(1).toLowerCase()} />
          </FieldGroup>
        ) : null}
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </Field>
        {error ? <p role="alert" className="t-label text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void save()}>
            {editing ? 'Save' : 'Add task'}
          </Button>
          {editing ? <Button variant="danger" icon="trash" aria-label="Delete task" onClick={async () => (await deleteTask(editing), close())} /> : null}
        </div>
      </div>
    </Sheet>
  )
}
