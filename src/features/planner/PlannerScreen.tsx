import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getPlannerBundle } from '@/data/repos/bundles'
import { setIntention } from '@/data/repos/planner'
import { addDays, dayOfWeek, formatDay, formatDuration, durationMinutes, fromMinutes, relativeDay, toMinutes } from '@/domain/dates'
import { DAY_END, DAY_START, HOUR_PX, applyDrag, geometry, layoutColumns, minutesAtY, slotsOnDay, barrierMessage, type DragMode } from '@/domain/planner'
import { expandEvents } from '@/domain/recurrence'
import type { PlannerTaskRow } from '@/data/types'
import { Button, IconButton, Note, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Checkbox } from '@/ui/controls'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { LiveText } from '@/features/common/bits'
import { useUi } from '@/features/store'
import { useNowTime, useToday } from '@/features/useToday'
import { editPlannerTask, setTaskStatus } from '@/features/services/planner'
import { PlanTomorrow } from './PlanTomorrow'

const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i)
const GUTTER = 48
const TAP_SLOP = 5

interface Drag {
  id: string
  mode: DragMode
  startY: number
  dy: number
  moved: boolean
}

export function PlannerScreen() {
  const today = useToday()
  const now = useNowTime()
  const [date, setDate] = useState(today)
  const [tomorrowOpen, setTomorrowOpen] = useState(false)
  const openSheet = useUi((s) => s.openSheet)
  const openLog = useUi((s) => s.openLog)
  const data = useLiveQuery(() => getPlannerBundle(date), [date])
  const [notice, setNotice] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [settling, setSettling] = useState<string | null>(null) // id of a block springing back
  const timeline = useRef<HTMLDivElement>(null)
  const setPlannerDate = useUi((s) => s.setPlannerDate)
  useEffect(() => {
    setPlannerDate(date)
    return () => setPlannerDate(null)
  }, [date, setPlannerDate])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(id)
  }, [notice])

  const barriers = useMemo(() => (data ? slotsOnDay(data.slots, dayOfWeek(date)) : []), [data, date])
  const timed = useMemo(() => (data?.tasks ?? []).filter((t) => t.startTime && t.endTime), [data])
  const untimed = useMemo(() => (data?.tasks ?? []).filter((t) => !(t.startTime && t.endTime)), [data])
  const columns = useMemo(() => layoutColumns(timed.map((t) => ({ id: t.id, start: t.startTime!, end: t.endTime! }))), [timed])
  const plan = useMemo(() => (data ? expandEvents(data.events, data.annotations, date, date).filter((o) => o.startTime && o.endTime && o.event.type === 'STUDY_BLOCK') : []), [data, date])

  const dsw = (HOUR_PX / 60) // px per minute

  function onPointerDown(e: React.PointerEvent, t: PlannerTaskRow, mode: DragMode) {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setSettling(null)
    setDrag({ id: t.id, mode, startY: e.clientY, dy: 0, moved: false })
  }
  function onPointerMove(e: React.PointerEvent) {
    setDrag((d) => (d ? { ...d, dy: e.clientY - d.startY, moved: d.moved || Math.abs(e.clientY - d.startY) > TAP_SLOP } : d))
  }
  async function onPointerUp(t: PlannerTaskRow) {
    const d = drag
    setDrag(null)
    if (!d) return
    if (!d.moved) {
      if (d.mode === 'move') openSheet('task', { id: t.id, date })
      return
    }
    const out = applyDrag({ start: t.startTime!, end: t.endTime! }, d.mode, d.dy / dsw, barriers)
    if (out.collision) {
      setSettling(t.id) // spring back to where it was…
      setTimeout(() => setSettling(null), 400)
      setNotice(barrierMessage(out.collision)) // …and say what it hit
      return
    }
    if (out.changed) await editPlannerTask(t.id, date, { startTime: out.start, endTime: out.end })
  }

  function onBackgroundTap(e: React.MouseEvent) {
    const rect = timeline.current!.getBoundingClientRect()
    const start = minutesAtY(e.clientY - rect.top)
    const s = fromMinutes(start)
    const end = fromMinutes(Math.min(DAY_END, start + 60))
    openSheet('task', { date, start: s, end })
  }

  async function toggleDone(t: PlannerTaskRow, done: boolean) {
    await setTaskStatus(t.id, done ? 'DONE' : 'TODO')
    // Planned minutes are not measured minutes: DONE PRE-FILLS the log sheet, it never writes a block itself.
    if (done) openLog(date <= today ? date : today, { track: t.track ?? 'PROJECT', minutes: t.startTime && t.endTime ? durationMinutes(t.startTime, t.endTime) : undefined, topic: t.title })
  }

  const height = ((DAY_END - DAY_START) / 60) * HOUR_PX
  const isToday = date === today
  const nowTop = isToday && toMinutes(now) >= DAY_START && toMinutes(now) <= DAY_END ? ((toMinutes(now) - DAY_START) / 60) * HOUR_PX : null

  return (
    <Screen>
      <ScreenTitle
        sub={`${formatDay(date, 'dddd D MMMM')} · ${relativeDay(date, today)}`}
        right={<Button variant="secondary" className="!min-h-9 !px-4" onClick={() => setTomorrowOpen(true)} data-testid="plan-tomorrow">Plan tomorrow</Button>}
      >
        planner
      </ScreenTitle>

      <div className="mb-3 flex items-center justify-between rounded-[14px] bg-surface p-1">
        <IconButton icon="chevron-left" label="Previous day" onClick={() => setDate(addDays(date, -1))} />
        <button type="button" className="press t-body-strong px-3" onClick={() => setDate(today)}>
          {isToday ? 'Today' : formatDay(date)}
        </button>
        <IconButton icon="chevron-right" label="Next day" onClick={() => setDate(addDays(date, 1))} />
      </div>

      <LiveText key={`intent-${date}`} label="Intention for the day" placeholder="One intention for the day" value={data?.day?.intention ?? ''} onSave={(v) => void setIntention(date, v)} />

      <div className="min-h-6" role="status" aria-live="polite">
        {notice ? <p className="t-label mt-2 flex items-center gap-1.5 text-warning" data-testid="notice"><Icon name="alert" size={14} />{notice}</p> : null}
      </div>

      {untimed.length > 0 ? (
        <>
          <SectionLabel>Unscheduled</SectionLabel>
          <ul className="mb-3 flex flex-col gap-2" aria-label="Unscheduled tasks">
            {untimed.map((t) => (
              <li key={t.id} className={cn('flex items-center gap-3 rounded-[14px] bg-surface p-3.5', (t.status === 'DONE' || t.status === 'SKIPPED' || t.status === 'MOVED') && 'opacity-50')}>
                <Checkbox label={`Done: ${t.title}`} checked={t.status === 'DONE'} onChange={(v) => void toggleDone(t, v)} />
                <button type="button" className="press t-body min-w-0 flex-1 text-left" onClick={() => openSheet('task', { id: t.id, date })}>
                  <span className={cn(t.priority === 'MUST' ? 't-body-strong' : '', t.priority === 'COULD' && 'text-ink-2')}>{t.title}</span>
                </button>
                <Pill tone="outline">{t.priority.toLowerCase()}</Pill>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionLabel right={<span className="t-meta text-ink-2">tap empty time to add</span>}>Day</SectionLabel>
      <div className="relative overflow-hidden rounded-[14px] bg-surface" data-testid="timeline">
        <div ref={timeline} className="relative" style={{ height, marginLeft: GUTTER }} onClick={onBackgroundTap} role="application" aria-label="Day timeline">
          {HOURS.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-hairline" style={{ top: (h - DAY_START / 60) * HOUR_PX }}>
              <span className="t-meta absolute -top-2 text-ink-2" style={{ left: -GUTTER + 8 }}>
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}

          {/* The plan's own blocks: context only, not draggable */}
          {plan.map((o) => (
            <div key={o.key} className="pointer-events-none absolute inset-x-1 rounded-[8px] border border-dashed border-hairline" style={geometry(o.startTime!, o.endTime!)} aria-hidden>
              <span className="t-meta px-2 text-ink-3">{o.title}</span>
            </div>
          ))}

          {/* Timetable: IMMOVABLE barriers */}
          {barriers.map((s) => (
            <div
              key={s.id}
              data-testid="barrier"
              className="pointer-events-none absolute inset-x-0 overflow-hidden border-y border-hairline"
              style={{ ...geometry(s.startTime, s.endTime), background: 'repeating-linear-gradient(135deg, var(--raised) 0 6px, transparent 6px 12px)' }}
              aria-label={`${s.title}, ${s.startTime} to ${s.endTime}, fixed`}
            >
              <span className="t-meta flex items-center gap-1 px-2 py-1 text-ink-2">
                <Icon name="clock" size={11} /> {s.title}
              </span>
            </div>
          ))}

          {nowTop !== null ? <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-accent" style={{ top: nowTop }} aria-hidden /> : null}

          {/* Tasks: drag to move, drag the handle to resize, snap 15 min */}
          {timed.map((t) => {
            const place = columns.get(t.id) ?? { col: 0, cols: 1 }
            const g = geometry(t.startTime!, t.endTime!)
            const dragging = drag?.id === t.id && drag.moved
            const dy = dragging ? drag!.dy : 0
            const mode = drag?.mode
            const style: React.CSSProperties = {
              top: g.top + (dragging && mode === 'move' ? dy : 0),
              height: g.height + (dragging && mode === 'resize' ? dy : 0),
              left: `calc(${(100 / place.cols) * place.col}% + 3px)`,
              width: `calc(${100 / place.cols}% - 6px)`,
              touchAction: 'none',
              transition: dragging ? 'none' : settling === t.id ? 'top 360ms var(--ease-sheet), height 360ms var(--ease-sheet)' : undefined,
            }
            const finished = t.status === 'DONE' || t.status === 'SKIPPED' || t.status === 'MOVED'
            return (
              <div
                key={t.id}
                data-testid="task-block"
                data-task-id={t.id}
                className={cn('absolute z-10 overflow-hidden rounded-[10px] bg-raised p-2 ring-1 ring-ink-3/40 select-none', dragging && 'z-30 ring-2 ring-accent', finished && 'opacity-50', t.priority === 'COULD' && 'ring-hairline')}
                style={style}
                onPointerDown={(e) => onPointerDown(e, t, 'move')}
                onPointerMove={onPointerMove}
                onPointerUp={() => void onPointerUp(t)}
                onPointerCancel={() => setDrag(null)}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-1.5">
                  <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <Checkbox label={`Done: ${t.title}`} checked={t.status === 'DONE'} onChange={(v) => void toggleDone(t, v)} className="!-m-3.5 !size-11 scale-[0.7]" />
                  </span>
                  <div className="min-w-0 flex-1 pl-0.5">
                    <div className={cn('t-label leading-tight', t.priority === 'MUST' ? 'font-bold' : 'font-medium', t.status === 'DONE' && 'line-through')}>{t.title}</div>
                    {g.height > 40 ? <div className="t-meta text-ink-2">{t.startTime}–{t.endTime} · {formatDuration(durationMinutes(t.startTime!, t.endTime!))}</div> : null}
                  </div>
                </div>
                <div
                  role="slider"
                  aria-label={`Resize ${t.title}`}
                  aria-valuenow={durationMinutes(t.startTime!, t.endTime!)}
                  className="absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize items-center justify-center"
                  onPointerDown={(e) => onPointerDown(e, t, 'resize')}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => void onPointerUp(t)}
                >
                  <span className="h-0.5 w-6 rounded-full bg-ink-3" />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {barriers.length === 0 && data ? <Note className="mt-2">No timetable for this weekday. Add yours under More → Timetable and it will appear here as fixed blocks.</Note> : null}

      <PlanTomorrow open={tomorrowOpen} onClose={() => setTomorrowOpen(false)} date={date} tasks={data?.tasks ?? []} onGo={(d) => (setDate(d), setTomorrowOpen(false))} />
    </Screen>
  )
}
