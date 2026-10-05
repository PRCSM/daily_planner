import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDay, setIntention } from '@/data/repos/planner'
import { allSlots } from '@/data/repos/timetable'
import { dayBundle } from '@/data/repos/planner'
import { dayOfWeek, formatDay } from '@/domain/dates'
import { slotsOnDay } from '@/domain/planner'
import type { PlannerTaskRow } from '@/data/types'
import { Sheet } from '@/ui/Sheet'
import { Button, Chip, Note, Pill } from '@/ui/primitives'
import { ChipGroup, TextField } from '@/ui/controls'
import { LiveText } from '@/features/common/bits'
import { addPlannerTask, moveTaskForward, setTaskStatus, tomorrowOf } from '@/features/services/planner'
import { PRIORITIES, type Priority } from '@/lib/enums'

/**
 * The evening ritual: look at tomorrow's fixed commitments, carry over what didn't happen, set one
 * intention, queue the must-dos. Unscheduled by design — you place them on the timeline in the morning.
 */
export function PlanTomorrow({ open, onClose, date, tasks, onGo }: { open: boolean; onClose: () => void; date: string; tasks: PlannerTaskRow[]; onGo: (d: string) => void }) {
  const next = tomorrowOf(date)
  const slots = useLiveQuery(allSlots, [], [])
  const nextDay = useLiveQuery(() => getDay(next), [next])
  const queued = useLiveQuery(() => dayBundle(next), [next])
  const classes = slotsOnDay(slots, dayOfWeek(next))
  const open_ = tasks.filter((t) => t.status === 'TODO' || t.status === 'DOING')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('MUST')
  const ref = useRef<HTMLInputElement>(null)

  async function add() {
    const t = title
    if (!t.trim()) return
    setTitle('') // clear first: keystrokes during the write belong to the next task
    ref.current?.focus()
    await addPlannerTask({ date: next, title: t, priority })
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Plan ${formatDay(next, 'dddd')}`} testId="plan-tomorrow-sheet">
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="t-label mb-2 text-ink-2">Fixed commitments</h3>
          {classes.length ? (
            <div className="flex flex-wrap gap-1.5">
              {classes.map((s) => (
                <Pill key={s.id}>{s.startTime} {s.title}</Pill>
              ))}
            </div>
          ) : (
            <Note>Nothing fixed on {formatDay(next, 'dddd')}.</Note>
          )}
        </section>

        {open_.length ? (
          <section>
            <h3 className="t-label mb-2 text-ink-2">Didn’t happen today</h3>
            <ul className="flex flex-col gap-2">
              {open_.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-[12px] bg-surface p-3" data-testid="carry-item">
                  <span className="t-body min-w-0 flex-1 truncate">{t.title}</span>
                  <Chip onClick={() => void moveTaskForward(t, next)}>Move to {formatDay(next, 'ddd')}</Chip>
                  <Chip onClick={() => void setTaskStatus(t.id, 'SKIPPED')}>Drop</Chip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="t-label mb-2 text-ink-2">One intention</h3>
          <LiveText key={`intent-${next}`} label="Intention for tomorrow" placeholder="What would make tomorrow a good day?" value={nextDay?.intention ?? ''} onSave={(v) => void setIntention(next, v)} />
        </section>

        <section>
          <h3 className="t-label mb-2 text-ink-2">Queue tasks</h3>
          <div className="flex gap-2">
            <TextField
              ref={ref}
              aria-label="Task for tomorrow"
              placeholder="task — then Enter"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void add()
                }
              }}
            />
          </div>
          <div className="mt-2">
            <ChipGroup label="Priority" options={PRIORITIES} value={priority} onChange={setPriority} render={(p) => p[0] + p.slice(1).toLowerCase()} />
          </div>
          {queued?.tasks.length ? (
            <ul className="mt-3 flex flex-col gap-1.5" aria-label="Tasks queued for tomorrow">
              {queued.tasks.map((t) => (
                <li key={t.id} className="t-label flex items-center justify-between rounded-[10px] bg-surface px-3 py-2">
                  <span className="truncate">{t.title}</span>
                  <Pill tone="outline">{t.priority.toLowerCase()}</Pill>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <Button onClick={() => onGo(next)}>Open {formatDay(next, 'dddd')}</Button>
      </div>
    </Sheet>
  )
}
