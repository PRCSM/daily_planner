import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allSlots } from '@/data/repos/timetable'
import { deleteLocalBlob, getLocalBlob, saveLocalBlob } from '@/data/repos/settings'
import { DEFAULT_LAYOUT, cellSlot, parseTimetableFile, periodsOf, MAX_IMPORT_BYTES, type ImportResult, type Layout } from '@/domain/timetable'
import { fromMinutes, toMinutes } from '@/domain/dates'
import { Button, Chip, Note, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Stepper, TextField } from '@/ui/controls'
import { Checkbox } from '@/ui/controls'
import { Collapsible, Rail } from '@/features/common/bits'
import { addSubject, getLayout, getSubjects, importSlots, paintCell, saveLayout } from '@/features/services/timetable'
import { cn } from '@/lib/cn'

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const ERASE = '__erase__'

export function TimetableScreen() {
  const layout = useLiveQuery(getLayout, [], DEFAULT_LAYOUT)
  const slots = useLiveQuery(allSlots, [], [])
  const savedSubjects = useLiveQuery(getSubjects, [], [])
  const periods = useMemo(() => periodsOf(layout), [layout])
  const [active, setActive] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const subjectRef = useRef<HTMLInputElement>(null)

  const subjects = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of [...savedSubjects, ...slots.map((s) => s.title)]) if (!seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s)
    return [...seen.values()]
  }, [savedSubjects, slots])

  const days = DAY_ORDER.filter((d) => layout.days.includes(d))

  async function commitSubject() {
    const typed = draft
    setDraft('') // clear synchronously: keystrokes arriving while the write is in flight belong to the NEXT subject
    const name = await addSubject(typed)
    if (name) setActive(name)
    subjectRef.current?.focus() 
  }

  return (
    <Screen>
      <ScreenTitle sub="Pick a subject, tap the cells. Planner treats these as immovable.">timetable</ScreenTitle>

      <SectionLabel>Subjects</SectionLabel>
      <Rail label="Subjects">
        {subjects.map((s) => (
          <Chip key={s} selected={active === s} onClick={() => setActive(active === s ? null : s)}>
            {s}
          </Chip>
        ))}
        <Chip selected={active === ERASE} onClick={() => setActive(active === ERASE ? null : ERASE)}>
          Eraser
        </Chip>
        <Chip onClick={() => (setAdding(true), setTimeout(() => subjectRef.current?.focus(), 0))}>+ New subject</Chip>
      </Rail>
      {adding ? (
        <div className="mt-2 flex gap-2">
          <TextField
            ref={subjectRef}
            aria-label="New subject"
            placeholder="subject — Enter adds, keep typing"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commitSubject()
              }
            }}
          />
          <Button variant="secondary" onClick={() => setAdding(false)}>
            Done
          </Button>
        </div>
      ) : null}

      <SectionLabel>Week</SectionLabel>
      <div className="overflow-x-auto rounded-[14px] bg-surface p-2">
        <table className="w-full table-fixed border-separate border-spacing-1" aria-label="Timetable grid">
          <thead>
            <tr>
              <th className="w-12" />
              {days.map((d) => (
                <th key={d} className="t-meta pb-1 text-center font-medium text-ink-2">
                  {DAY_LABEL[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.index}>
                <th scope="row" className="t-meta pr-1 text-right align-middle font-medium text-ink-2">
                  {p.start}
                </th>
                {days.map((d) => {
                  const slot = cellSlot(slots, d, p)
                  return (
                    <td key={d} className="p-0">
                      <button
                        type="button"
                        aria-label={`${DAY_LABEL[d]} ${p.start}${slot ? `: ${slot.title}` : ': empty'}`}
                        onClick={() => active && void paintCell(d, p, active === ERASE ? null : active)}
                        className={cn('press t-meta flex h-12 w-full items-center justify-center overflow-hidden rounded-[8px] px-1 text-center leading-tight', slot ? 'bg-raised text-ink' : 'text-ink-3 ring-1 ring-hairline ring-inset')}
                      >
                        {slot ? <span className="line-clamp-2 break-words">{slot.title}</span> : '·'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!active ? <Note className="px-1 pt-2">Choose a subject above, then tap cells to fill them.</Note> : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <GridSettings layout={layout} />
        <ImportPanel />
        <PhotoPanel />
      </div>
    </Screen>
  )
}

function GridSettings({ layout }: { layout: Layout }) {
  const set = (patch: Partial<Layout>) => void saveLayout({ ...layout, ...patch })
  return (
    <Collapsible title="Grid: periods & days">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="t-label">First period starts</span>
          <Stepper label="First period" value={toMinutes(layout.start)} onChange={(v) => set({ start: fromMinutes(v) })} min={5 * 60} max={14 * 60} step={15} format={(v) => fromMinutes(v)} />
        </div>
        <div className="flex items-center justify-between">
          <span className="t-label">Period length</span>
          <Stepper label="Period length" value={layout.length} onChange={(v) => set({ length: v })} min={30} max={120} step={5} format={(v) => `${v}m`} />
        </div>
        <div className="flex items-center justify-between">
          <span className="t-label">Periods per day</span>
          <Stepper label="Periods per day" value={layout.count} onChange={(v) => set({ count: v })} min={1} max={10} />
        </div>
        <div role="group" aria-label="Days" className="flex flex-wrap gap-2">
          {DAY_ORDER.map((d) => (
            <Chip key={d} selected={layout.days.includes(d)} onClick={() => set({ days: layout.days.includes(d) ? layout.days.filter((x) => x !== d) : [...layout.days, d] })}>
              {DAY_LABEL[d]}
            </Chip>
          ))}
        </div>
      </div>
    </Collapsible>
  )
}

/** .ics / .csv → parse → REVIEW → write. Nothing is written until you confirm. */
function ImportPanel() {
  const [result, setResult] = useState<(ImportResult & { name: string }) | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [mode, setMode] = useState<'replace' | 'add'>('replace')
  const [done, setDone] = useState<string | null>(null)

  async function onFile(f: File | undefined) {
    setDone(null)
    if (!f) return
    if (f.size > MAX_IMPORT_BYTES) return setResult({ name: f.name, slots: [], warnings: [], errors: [{ where: 'file', message: 'File is too large (max 1 MB).' }] })
    const r = parseTimetableFile(f.name, await f.text())
    setResult({ ...r, name: f.name })
    setPicked(new Set(r.slots.map((_, i) => i)))
  }

  return (
    <Collapsible title="Import .ics / .csv">
      <Note className="mb-3">CSV needs columns: title, day, start, end (location optional). You’ll review everything before anything is saved.</Note>
      <input aria-label="Choose a timetable file" type="file" accept=".ics,.csv,text/calendar,text/csv" className="t-label block w-full" onChange={(e) => void onFile(e.target.files?.[0])} />
      {result ? (
        <div className="mt-4 flex flex-col gap-3" data-testid="import-review">
          <div className="t-label">
            <b>{result.name}</b>: {result.slots.length} slot{result.slots.length === 1 ? '' : 's'} found
            {result.errors.length ? `, ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}` : ''}
          </div>
          {result.errors.length ? (
            <ul className="t-label list-disc pl-5 text-danger" aria-label="Problems">
              {result.errors.slice(0, 8).map((e, i) => (
                <li key={i}>{e.where}: {e.message}</li>
              ))}
            </ul>
          ) : null}
          {result.warnings.length ? (
            <ul className="t-label list-disc pl-5 text-warning" aria-label="Warnings">
              {result.warnings.slice(0, 5).map((e, i) => (
                <li key={i}>{e.where}: {e.message}</li>
              ))}
            </ul>
          ) : null}
          <ul className="flex flex-col gap-1.5" aria-label="Slots to import">
            {result.slots.map((s, i) => (
              <li key={i} className="flex items-center gap-3 rounded-[10px] bg-raised px-3 py-2">
                <Checkbox label={`Import ${s.title}`} checked={picked.has(i)} onChange={(v) => setPicked((p) => (v ? new Set(p).add(i) : new Set([...p].filter((x) => x !== i))))} />
                <span className="t-label min-w-0 flex-1 truncate"><b>{s.title}</b> · {DAY_LABEL[s.dayOfWeek]} {s.startTime}–{s.endTime}</span>
                {s.location ? <Pill>{s.location}</Pill> : null}
              </li>
            ))}
          </ul>
          {result.slots.length ? (
            <>
              <div role="group" aria-label="Import mode" className="flex gap-2">
                <Chip selected={mode === 'replace'} onClick={() => setMode('replace')}>Replace my timetable</Chip>
                <Chip selected={mode === 'add'} onClick={() => setMode('add')}>Add to it</Chip>
              </div>
              <Button
                disabled={picked.size === 0}
                onClick={async () => {
                  const n = await importSlots(result.slots.filter((_, i) => picked.has(i)), mode, result.name)
                  setDone(`Imported ${n} slot${n === 1 ? '' : 's'}.`)
                  setResult(null)
                }}
              >
                Import {picked.size} slot{picked.size === 1 ? '' : 's'}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {done ? <p role="status" className="t-label mt-3">{done}</p> : null}
    </Collapsible>
  )
}

/** A reference photo of your printed timetable. No OCR — it's just there to read while you paint. */
function PhotoPanel() {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let made: string | null = null
    void getLocalBlob('timetablePhoto').then((b) => {
      if (cancelled || !b) return
      made = URL.createObjectURL(b)
      setUrl(made)
    })
    return () => {
      cancelled = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [])
  return (
    <Collapsible title="Reference photo">
      <Note className="mb-3">Stays on this device (not synced). No text recognition — just a picture to look at while you fill the grid.</Note>
      {url ? <img src={url} alt="Your timetable" className="mb-3 w-full rounded-[12px]" /> : null}
      <div className="flex gap-2">
        <label className="press t-body-strong inline-flex min-h-11 cursor-pointer items-center rounded-full bg-raised px-5">
          {url ? 'Replace photo' : 'Add photo'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Choose a photo"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f || !f.type.startsWith('image/') || f.size > 12_000_000) return
              await saveLocalBlob('timetablePhoto', f)
              setUrl(URL.createObjectURL(f))
            }}
          />
        </label>
        {url ? (
          <Button variant="ghost" onClick={async () => (await deleteLocalBlob('timetablePhoto'), setUrl(null))}>
            Remove
          </Button>
        ) : null}
      </div>
    </Collapsible>
  )
}
