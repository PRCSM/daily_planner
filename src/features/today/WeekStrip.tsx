import { addDays, eachDay, formatDay, startOfWeek } from '@/domain/dates'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Seven days, Monday-first. A pill SLIDES behind the active day (spring {280ms, 0.95}). */
export function WeekStrip({ selected, today, logged, onSelect }: { selected: string; today: string; logged: ReadonlySet<string>; onSelect: (d: string) => void }) {
  const monday = startOfWeek(selected)
  const days = eachDay(monday, addDays(monday, 6))
  const idx = days.indexOf(selected)
  return (
    <div className="flex items-center gap-1" data-testid="week-strip">
      <button type="button" aria-label="Previous week" className="press flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2" onClick={() => onSelect(addDays(selected, -7))}>
        <Icon name="chevron-left" size={18} />
      </button>
      <div className="relative grid flex-1 grid-cols-7 rounded-[14px] bg-surface p-1">
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-1 rounded-[11px] bg-raised"
          style={{ width: 'calc((100% - 8px) / 7)', transform: `translateX(${idx * 100}%)`, transition: 'transform var(--dur-slide) var(--ease-slide)' }}
        />
        {days.map((d, i) => (
          <button
            key={d}
            type="button"
            aria-label={formatDay(d, 'dddd D MMMM')}
            aria-current={d === selected ? 'date' : undefined}
            onClick={() => onSelect(d)}
            className={cn('relative z-10 flex h-14 flex-col items-center justify-center gap-0.5 rounded-[11px]', d === selected ? 'text-ink' : 'text-ink-2')}
          >
            <span className="t-meta">{LETTERS[i]}</span>
            <span className="t-body-strong tabular-nums">{Number(d.slice(8))}</span>
            <span className="flex h-1.5 items-center gap-0.5">
              {d === today ? <span className="size-1.5 rounded-full bg-accent" aria-label="today" /> : null}
              {logged.has(d) ? <span className="size-1.5 rounded-full bg-ink-2" aria-label="logged" /> : null}
            </span>
          </button>
        ))}
      </div>
      <button type="button" aria-label="Next week" className="press flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2" onClick={() => onSelect(addDays(selected, 7))}>
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  )
}
