import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'

export interface NavItem {
  to: string
  label: string
  icon: IconName
}
export interface FabAction {
  label: string
  icon: IconName
  onSelect: () => void
}

/**
 * Floating CAPSULE (icon-only, elevated, a lighter filled pill slides behind the active icon)
 * plus a SEPARATE CIRCULAR FAB to its right that expands upward into labelled actions over a
 * dimmed backdrop. Circle-vs-capsule contrast is what stops them reading as duplicates.
 * These are the only shadowed elements in the app.
 */
export function BottomNav({ items, actions, activeIndex }: { items: NavItem[]; actions: FabAction[]; activeIndex: number }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const idx = activeIndex
  const count = items.length

  return (
    <>
      <div
        className={cn('fixed inset-0 z-30 bg-[var(--scrim)]', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        style={{ transition: 'opacity var(--dur-slide) ease-out' }}
        onClick={() => setOpen(false)}
        data-testid="fab-backdrop"
      />
      <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(16px,env(safe-area-inset-bottom))]" aria-label="Primary">
        <div className="mx-auto flex max-w-[520px] items-end gap-3">
          {/* Capsule */}
          <div className="relative flex h-[60px] flex-1 items-center rounded-full bg-raised px-1.5" style={{ boxShadow: 'var(--float)' }}>
            {idx >= 0 ? (
              <span
                aria-hidden
                className="absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-surface"
                style={{
                  width: `calc((100% - 12px) / ${count})`,
                  transform: `translateX(${idx * 100}%)`,
                  transition: 'transform var(--dur-slide) var(--ease-slide)',
                }}
              />
            ) : null}
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                aria-label={it.label}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn('press relative z-10 flex h-full flex-1 items-center justify-center rounded-full', isActive || loc.pathname === it.to ? 'text-ink' : 'text-ink-2')
                }
              >
                <Icon name={it.icon} size={22} />
              </NavLink>
            ))}
          </div>

          {/* FAB */}
          <div className="relative">
            <div
              className="absolute right-0 bottom-[68px] flex w-max flex-col items-end gap-2"
              style={{ pointerEvents: open ? 'auto' : 'none' }}
              role="menu"
              aria-label="Quick actions"
            >
              {actions.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  tabIndex={open ? 0 : -1}
                  className="press t-body-strong flex h-12 items-center gap-2.5 rounded-full bg-raised pr-5 pl-4"
                  style={{
                    boxShadow: 'var(--float)',
                    opacity: open ? 1 : 0,
                    transform: open ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.92)',
                    transition: `transform var(--dur-sheet) var(--ease-sheet) ${open ? (actions.length - 1 - i) * 24 : 0}ms, opacity 140ms ease-out ${open ? (actions.length - 1 - i) * 24 : 0}ms`,
                  }}
                  onClick={() => {
                    setOpen(false)
                    a.onSelect()
                  }}
                >
                  <Icon name={a.icon} size={18} />
                  {a.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label={open ? 'Close quick actions' : 'Quick actions'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="press flex size-[60px] items-center justify-center rounded-full bg-accent text-on-accent"
              style={{ boxShadow: 'var(--float)' }}
              data-testid="fab"
            >
              <span style={{ transition: 'transform var(--dur-sheet) var(--ease-sheet)', transform: open ? 'rotate(45deg)' : 'rotate(0)' }} className="flex">
                <Icon name="plus" size={26} strokeWidth={2.4} />
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
