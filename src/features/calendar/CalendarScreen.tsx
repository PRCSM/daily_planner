import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAgenda } from '@/data/repos/events'
import { addMonths, formatDay, formatLong, monthGrid, monthLabel, startOfMonth } from '@/domain/dates'
import { agendaFor, FILTER_GROUPS, markersByDate, type Marker } from '@/domain/calendar'
import { expandEvents, type Occurrence } from '@/domain/recurrence'
import { effectiveFit } from '@/domain/opportunities'
import { Button, Chip, IconButton, Note, Pill, Screen, ScreenTitle } from '@/ui/primitives'
import { Checkbox } from '@/ui/controls'
import { Sheet } from '@/ui/Sheet'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { setOccurrenceDone } from '@/features/services/events'
import { FitPill } from '@/features/opportunities/FitPill'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function MarkerGlyph({ m }: { m: Marker }) {
  // Shape carries criticality; colour appears ONLY when a HARD item is imminent.
  const color = m.imminent ? 'text-danger' : 'text-ink-2'
  if (m.shape === 'bar') return <span title={m.title} className={cn('block h-1 w-4 rounded-full bg-current', color)} />
  if (m.shape === 'dot') return <span title={m.title} className={cn('block size-1.5 rounded-full bg-current', color)} />
  return <span title={m.title} className={cn('block size-1.5 rounded-full ring-1 ring-current ring-inset', color)} />
}

export function CalendarScreen() {
  const today = useToday()
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const filters = useUi((s) => s.calendarFilters)
  const toggleFilter = useUi((s) => s.toggleCalendarFilter)
  const openSheet = useUi((s) => s.openSheet)

  const grid = useMemo(() => monthGrid(month), [month])
  const from = grid[0]!
  const to = grid.at(-1)!
  const data = useLiveQuery(() => getAgenda(from, to), [from, to])
  const occurrences = useMemo(() => (data ? expandEvents(data.events, data.annotations, from, to) : []), [data, from, to])
  const markers = useMemo(() => markersByDate(occurrences, today, filters), [occurrences, today, filters])

  return (
    <Screen>
      <ScreenTitle right={<IconButton icon="plus" label="Add event" onClick={() => openSheet('event', { date: dayOpen ?? today })} className="bg-surface" />}>calendar</ScreenTitle>

      <div className="mb-3 flex items-center justify-between">
        <IconButton icon="chevron-left" label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
        <button type="button" className="press t-heading" onClick={() => setMonth(startOfMonth(today))} aria-label="Jump to this month">
          {monthLabel(month)}
        </button>
        <IconButton icon="chevron-right" label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
      </div>

      <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filters">
        {FILTER_GROUPS.map((g) => (
          <Chip key={g.id} selected={filters.includes(g.id)} onClick={() => toggleFilter(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>

      <div className="rounded-[14px] bg-surface p-2" role="grid" aria-label={monthLabel(month)}>
        <div className="grid grid-cols-7" role="row">
          {DOW.map((d, i) => (
            <div key={i} role="columnheader" className="t-meta py-1.5 text-center text-ink-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {grid.map((d) => {
            const cell = markers.get(d)
            const inMonth = d.slice(0, 7) === month.slice(0, 7)
            const isToday = d === today
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-label={`${formatDay(d, 'dddd D MMMM')}${cell ? `, ${cell.markers.length + cell.extra} item${cell.markers.length + cell.extra === 1 ? '' : 's'}` : ''}`}
                onClick={() => setDayOpen(d)}
                className={cn('press flex h-[58px] flex-col items-center gap-1 rounded-[10px] pt-1.5', inMonth ? 'text-ink' : 'text-ink-3', isToday && 'bg-raised')}
              >
                <span className={cn('t-label flex size-6 items-center justify-center rounded-full tabular-nums', isToday && 'bg-accent text-on-accent')}>{Number(d.slice(8))}</span>
                <span className="flex min-h-2 items-center gap-1">
                  {cell?.markers.map((m) => <MarkerGlyph key={m.key} m={m} />)}
                  {cell && cell.extra > 0 ? <span className="t-meta text-ink-2">+{cell.extra}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 px-1" aria-label="Legend">
        <span className="t-meta flex items-center gap-1.5 text-ink-2"><span className="block h-1 w-4 rounded-full bg-current" /> hard</span>
        <span className="t-meta flex items-center gap-1.5 text-ink-2"><span className="block size-1.5 rounded-full bg-current" /> soft</span>
        <span className="t-meta flex items-center gap-1.5 text-ink-2"><span className="block size-1.5 rounded-full ring-1 ring-current ring-inset" /> info</span>
        <span className="t-meta flex items-center gap-1.5 text-danger"><span className="block h-1 w-4 rounded-full bg-current" /> hard &amp; &lt;14 days</span>
      </div>

      <AgendaSheet date={dayOpen} occurrences={occurrences} today={today} onClose={() => setDayOpen(null)} />
    </Screen>
  )
}

function AgendaSheet({ date, occurrences, today, onClose }: { date: string | null; occurrences: Occurrence[]; today: string; onClose: () => void }) {
  const openSheet = useUi((s) => s.openSheet)
  const items = useMemo(() => (date ? agendaFor(occurrences, date) : []), [date, occurrences])
  const [last, setLast] = useState<string | null>(null)
  const shown = date ?? last
  if (date && date !== last) setLast(date)
  return (
    <Sheet open={date !== null} onClose={onClose} title={shown ? formatLong(shown) : ''} testId="agenda-sheet">
      {items.length === 0 ? <Note>Nothing on this day.</Note> : null}
      <ul className="flex flex-col gap-2">
        {items.map((o) => {
          const fit = o.event.fitPill ? effectiveFit(o.event, today) : null
          return (
            <li key={o.key} className="rounded-[14px] bg-surface p-4">
              <div className="flex items-start gap-3">
                <Checkbox label={`Done: ${o.title}`} checked={o.done} onChange={(v) => void setOccurrenceDone(o, v)} />
                <div className="min-w-0 flex-1">
                  <div className="t-body-strong">{o.title}</div>
                  <div className="t-meta mt-0.5 flex flex-wrap items-center gap-1.5 text-ink-2">
                    {o.startTime ? <span>{o.startTime}{o.endTime ? `–${o.endTime}` : ''}</span> : null}
                    {o.span ? <span>day {o.span.index + 1} of {o.span.length}</span> : null}
                    {o.event.criticality === 'HARD' ? <Pill tone="danger">HARD</Pill> : null}
                    {fit ? <FitPill fit={fit} /> : null}
                  </div>
                  {o.event.caveat ? <p className="t-label mt-2 text-ink-2">{o.event.caveat}</p> : null}
                  {o.notes ? <p className="t-label mt-1.5 text-ink-2">{o.notes}</p> : null}
                  {o.event.linkUrl ? (
                    <a href={o.event.linkUrl} target="_blank" rel="noopener noreferrer" className="t-label mt-2 inline-flex items-center gap-1 underline underline-offset-2">
                      Open link <Icon name="link" size={14} />
                    </a>
                  ) : null}
                </div>
                <IconButton icon="edit" label={`Edit ${o.title}`} size={16} className="!size-9" onClick={() => openSheet('event', { id: o.eventId })} />
              </div>
            </li>
          )
        })}
      </ul>
      <Button variant="secondary" icon="plus" className="mt-4 w-full" onClick={() => openSheet('event', { date: shown ?? today })}>
        Add event on this day
      </Button>
    </Sheet>
  )
}
