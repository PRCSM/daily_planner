import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/ui/Icon'
import { TextField } from '@/ui/controls'

/** Debounced autosave text input that adopts external updates when it isn't focused. */
export function LiveText({
  value,
  onSave,
  placeholder,
  label,
  delay = 450,
  className,
  inputMode,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  label: string
  delay?: number
  className?: string
  inputMode?: 'text' | 'numeric'
}) {
  const [local, setLocal] = useState(value)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(local)
  latest.current = local
  const saved = useRef(value)

  useEffect(() => {
    if (!focused.current && value !== latest.current) {
      setLocal(value)
      saved.current = value
    }
  }, [value])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (latest.current !== saved.current) {
      saved.current = latest.current
      onSave(latest.current)
    }
  }
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TextField
      aria-label={label}
      placeholder={placeholder ?? label}
      value={local}
      inputMode={inputMode}
      className={className}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        setLocal(e.target.value)
        latest.current = e.target.value
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, delay)
      }}
      onBlur={() => {
        focused.current = false
        flush()
      }}
    />
  )
}

export function Collapsible({ title, defaultOpen = false, open: controlled, onToggle, right, children, className }: { title: ReactNode; defaultOpen?: boolean; open?: boolean; onToggle?: (o: boolean) => void; right?: ReactNode; children: ReactNode; className?: string }) {
  const [inner, setInner] = useState(defaultOpen)
  const open = controlled ?? inner
  return (
    <div className={cn('rounded-[14px] bg-surface', className)}>
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left"
        onClick={() => {
          onToggle?.(!open)
          setInner(!open)
        }}
      >
        <span className="t-body-strong">{title}</span>
        <span className="flex items-center gap-2 text-ink-2">
          {right}
          <span style={{ transition: 'transform var(--dur-slide) var(--ease-slide)', transform: open ? 'rotate(180deg)' : 'none' }} className="flex">
            <Icon name="chevron-down" size={18} />
          </span>
        </span>
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  )
}

/** A horizontally scrolling chip rail (no scrollbar). */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-0.5">
      {children}
    </div>
  )
}

/**
 * A value that follows the database but updates INSTANTLY on interaction. Two quick taps on a stepper
 * must both count, even though the live query hasn't re-rendered between them.
 */
export function useOptimistic<T>(server: T): [T, (v: T) => void] {
  const [local, setLocal] = useState<{ v: T; server: T } | null>(null)
  // Adopt the database value as soon as it changes (that is the confirmation of our own write, or someone else's).
  const current = local && Object.is(local.server, server) ? local.v : server
  return [current, (v: T) => setLocal({ v, server })]
}
