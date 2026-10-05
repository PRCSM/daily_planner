import { useEffect, useState } from 'react'
import { createEvent, getEvent, removeEvent, updateEvent } from '@/data/repos/events'
import { Sheet } from '@/ui/Sheet'
import { Button, Note } from '@/ui/primitives'
import { ChipGroup, Field, FieldGroup, TextArea, TextField, Toggle } from '@/ui/controls'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { addDays, isValidDate, isValidTime } from '@/domain/dates'
import { CRITICALITIES, RECURRENCES, type Criticality, type Recurrence } from '@/lib/enums'

export interface EventSheetPayload {
  /** Edit this event. */
  id?: string
  /** Pre-fill the date when creating. */
  date?: string
}

const REC_LABEL: Record<Recurrence, string> = { NONE: 'Once', DAILY: 'Daily', WEEKDAYS: 'Mon–Fri', WEEKLY: 'Weekly' }
const CRIT_LABEL: Record<Criticality, string> = { HARD: 'Hard deadline', SOFT: 'Soft', INFO: 'FYI' }

/** Create or edit a dated thing. One timeline: custom events are just `events` rows of type CUSTOM. */
export function EventSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.closeSheet)
  const open = sheet.name === 'event'
  const payload = (sheet.payload ?? {}) as EventSheetPayload
  const today = useToday()

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [span, setSpan] = useState(false)
  const [endDate, setEndDate] = useState(today)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [crit, setCrit] = useState<Criticality>('SOFT')
  const [rec, setRec] = useState<Recurrence>('NONE')
  const [notes, setNotes] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = payload.id

  useEffect(() => {
    if (!open) return
    setError(null)
    if (payload.id) {
      void getEvent(payload.id).then((e) => {
        if (!e) return
        setTitle(e.title)
        setDate(e.date)
        setSpan(!!e.endDate)
        setEndDate(e.endDate ?? e.date)
        setStart(e.startTime ?? '')
        setEnd(e.endTime ?? '')
        setCrit(e.criticality)
        setRec(e.recurrence)
        setNotes(e.notes ?? '')
        setSeeded(e.seeded)
      })
    } else {
      setTitle('')
      setDate(payload.date ?? today)
      setSpan(false)
      setEndDate(payload.date ?? today)
      setStart('')
      setEnd('')
      setCrit('SOFT')
      setRec('NONE')
      setNotes('')
      setSeeded(false)
    }
  }, [open, payload.id, payload.date, today])

  async function save() {
    const t = title.trim()
    if (!t) return setError('Give it a title.')
    if (!isValidDate(date)) return setError('Pick a valid date.')
    if (span && (!isValidDate(endDate) || endDate < date)) return setError('The end date must be on or after the start date.')
    if ((start && !isValidTime(start)) || (end && !isValidTime(end))) return setError('Times must look like 09:30.')
    if (start && end && end <= start) return setError('The end time must be after the start time.')
    const fields = {
      title: t,
      date,
      endDate: span ? endDate : undefined,
      startTime: start || undefined,
      endTime: end || undefined,
      criticality: crit,
      recurrence: rec,
      notes: notes.trim() || undefined,
    }
    if (editing) await updateEvent(editing, fields)
    else await createEvent({ ...fields, type: 'CUSTOM', sourceModule: 'CALENDAR' })
    close()
  }

  return (
    <Sheet open={open} onClose={close} title={editing ? 'Edit event' : 'Add event'} testId="event-sheet">
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mock interview with Rhea" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={span ? 'Starts' : 'Date'}>
            <TextField type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {span ? (
            <Field label="Ends">
              <TextField type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          ) : (
            <Field label="Time (optional)">
              <div className="flex gap-2">
                <TextField type="time" aria-label="Start time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
            </Field>
          )}
        </div>
        {!span ? (
          <Field label="Until (optional)">
            <TextField type="time" aria-label="End time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        ) : null}
        <div className="flex items-center justify-between rounded-[12px] bg-surface p-3.5">
          <span className="t-body">Spans several days</span>
          <Toggle label="Spans several days" checked={span} onChange={(v) => (setSpan(v), v && setEndDate(addDays(date, 1)), v && setRec('NONE'))} />
        </div>
        <FieldGroup label="How hard is the date?">
          <ChipGroup label="Criticality" options={CRITICALITIES} value={crit} onChange={setCrit} render={(c) => CRIT_LABEL[c]} />
        </FieldGroup>
        {!span ? (
          <FieldGroup label="Repeats">
            <ChipGroup label="Repeats" options={RECURRENCES} value={rec} onChange={setRec} render={(r) => REC_LABEL[r]} />
          </FieldGroup>
        ) : null}
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
        </Field>
        {seeded ? <Note>This came with the plan. Your edit is kept — a later plan update won’t overwrite it.</Note> : null}
        {error ? <p role="alert" className="t-label text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void save()}>
            {editing ? 'Save' : 'Add event'}
          </Button>
          {editing ? (
            <Button
              variant="danger"
              icon="trash"
              aria-label="Delete event"
              onClick={async () => {
                await removeEvent(editing)
                close()
              }}
            />
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}
