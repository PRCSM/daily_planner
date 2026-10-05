import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'
import { Chip } from './primitives'

/** Tactile checkbox — 44px hit area, spring {260ms, 0.8}. */
export function Checkbox({ checked, onChange, label, className, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('-m-2.5 inline-flex size-11 shrink-0 items-center justify-center', className)}
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-full ring-2 ring-inset',
          checked ? 'bg-ink text-bg ring-ink' : 'ring-ink-3',
        )}
        style={{
          transition: 'background-color var(--dur-check) var(--ease-check), transform var(--dur-check) var(--ease-check)',
          transform: checked ? 'scale(1)' : 'scale(0.94)',
        }}
      >
        <span
          style={{ transition: 'transform var(--dur-check) var(--ease-check), opacity 120ms', transform: checked ? 'scale(1)' : 'scale(0.2)', opacity: checked ? 1 : 0 }}
          className="flex"
        >
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      </span>
    </button>
  )
}

/** Two-state switch. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full', checked ? 'bg-ink' : 'bg-raised')}
      style={{ transition: 'background-color var(--dur-slide) var(--ease-slide)' }}
    >
      <span
        className={cn('absolute left-0.5 size-6 rounded-full', checked ? 'bg-bg' : 'bg-ink-3')}
        style={{ transition: 'transform var(--dur-slide) var(--ease-slide)', transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}

/**
 * A REAL three-state control (true / false / unanswered): two chips, neither selected by
 * default, tapping the selected one clears it back to null. A checkbox defaulting to false
 * would make the `null` branch unreachable — which is how burnout flags start firing on
 * skipped reviews.
 */
export function TriState({
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
  label,
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
  yesLabel?: string
  noLabel?: string
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      <Chip selected={value === true} onClick={() => onChange(value === true ? null : true)} data-testid="tri-yes">
        {yesLabel}
      </Chip>
      <Chip selected={value === false} onClick={() => onChange(value === false ? null : false)} data-testid="tri-no">
        {noLabel}
      </Chip>
    </div>
  )
}

/** Segmented / single-choice chip row. */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
  render,
}: {
  options: readonly T[]
  value: T | null | undefined
  onChange: (v: T) => void
  label: string
  className?: string
  render?: (o: T) => ReactNode
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => (
        <Chip key={String(o)} selected={value === o} onClick={() => onChange(o)}>
          {render ? render(o) : String(o)}
        </Chip>
      ))}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  label,
  format,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  format?: (v: number) => string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-full bg-surface p-1">
      <button type="button" aria-label={`${label}: less`} className="press flex size-9 items-center justify-center rounded-full bg-raised" onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
        <Icon name="minus" size={16} />
      </button>
      <span className="t-body-strong min-w-10 text-center tabular-nums" aria-live="polite">
        {format ? format(value) : value}
      </span>
      <button type="button" aria-label={`${label}: more`} className="press flex size-9 items-center justify-center rounded-full bg-raised" onClick={() => onChange(clamp(value + step))} disabled={value >= max}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  )
}

const fieldCls = 'w-full rounded-[12px] bg-raised px-3.5 py-3 t-body outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-ink-3'

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextField({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldCls, className)} {...rest} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, 'min-h-20 resize-none', className)} {...rest} />
})

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="t-label mb-1.5 block px-1 text-ink-2">{label}</span>
      {children}
    </label>
  )
}
