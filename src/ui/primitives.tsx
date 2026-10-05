import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'

/* ── Layout ─────────────────────────────────────────────── */

/** Screen padding 20; bottom padding clears the floating nav. */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('mx-auto w-full max-w-[520px] px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[132px]', className)}>
      {children}
    </main>
  )
}

export function ScreenTitle({ children, right, sub }: { children: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="t-display truncate">{children}</h1>
        {sub ? <p className="t-label mt-1 text-ink-2">{sub}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2 pb-1">{right}</div> : null}
    </header>
  )
}

/** Cards are DARKER than the page. Radius 14, padding 16. */
export function Card({
  children,
  className,
  as: Tag = 'div',
  tone = 'surface',
  ...rest
}: { children: ReactNode; className?: string; as?: ElementType; tone?: 'surface' | 'raised' | 'danger' } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        'rounded-[14px] p-4',
        tone === 'surface' && 'bg-surface',
        tone === 'raised' && 'bg-raised',
        tone === 'danger' && 'bg-surface ring-1 ring-danger/60',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** The tight, list-like gap between cards is 8. */
export function CardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2', className)}>{children}</div>
}

export function SectionLabel({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-6 mb-2 flex items-center justify-between px-1 first:mt-0', className)}>
      <h2 className="t-label text-ink-2 uppercase tracking-wider">{children}</h2>
      {right}
    </div>
  )
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('t-label text-ink-2', className)}>{children}</p>
}

/* ── Row: **bold prefix:** regular description + right-aligned pill ── */

export function Row({
  prefix,
  children,
  right,
  leading,
  onClick,
  dim,
  className,
}: {
  prefix?: ReactNode
  children?: ReactNode
  right?: ReactNode
  leading?: ReactNode
  onClick?: () => void
  dim?: boolean
  className?: string
}) {
  const body = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="t-body min-w-0 flex-1">
        {prefix ? <span className="t-body-strong">{prefix}</span> : null}
        {prefix && children ? ' ' : null}
        {children}
      </span>
      {right ? <span className="shrink-0">{right}</span> : null}
    </>
  )
  const cls = cn('flex w-full items-center gap-3 rounded-[14px] bg-surface p-4 text-left', dim && 'opacity-50', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'press')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ── Pills & chips ───────────────────────────────────────── */

export type PillTone = 'neutral' | 'danger' | 'warning' | 'success' | 'accent' | 'outline'

export function Pill({ children, tone = 'neutral', className, icon }: { children: ReactNode; tone?: PillTone; className?: string; icon?: IconName }) {
  return (
    <span
      className={cn(
        't-meta inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 tabular-nums whitespace-nowrap',
        tone === 'neutral' && 'bg-raised text-ink-2',
        tone === 'outline' && 'text-ink-2 ring-1 ring-hairline ring-inset',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'warning' && 'bg-warning/15 text-warning',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'accent' && 'bg-accent text-on-accent',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  )
}

export function Chip({
  selected,
  children,
  className,
  tone,
  ...rest
}: { selected?: boolean; tone?: 'danger' | 'warning' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        't-label press inline-flex min-h-9 items-center rounded-full px-3.5 whitespace-nowrap',
        selected ? 'bg-ink text-bg' : 'bg-raised text-ink',
        !selected && tone === 'danger' && 'text-danger',
        !selected && tone === 'warning' && 'text-warning',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Button({
  variant = 'primary',
  className,
  children,
  icon,
  ...rest
}: { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        't-body-strong press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 disabled:opacity-40',
        variant === 'primary' && 'bg-ink text-bg',
        variant === 'secondary' && 'bg-surface text-ink',
        variant === 'ghost' && 'text-ink-2',
        variant === 'danger' && 'bg-danger/15 text-danger',
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon, label, className, size = 20, ...rest }: { icon: IconName; label: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} className={cn('press inline-flex size-11 items-center justify-center rounded-full text-ink-2', className)} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  )
}

/** Hairline-separated "empty is fine" text. Never used for the review queue (absent when empty). */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="t-label rounded-[14px] bg-surface p-4 text-ink-2">{children}</div>
}

/** The honest placeholder when there's nothing real to show. */
export function NotEnoughData({ children = 'Not enough data yet.' }: { children?: ReactNode }) {
  return <span className="t-label text-ink-2">{children}</span>
}
