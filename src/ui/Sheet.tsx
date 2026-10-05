import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconButton } from './primitives'

/**
 * Bottom sheet. PRE-MOUNTED by design: it is always in the tree, so opening is a CSS
 * transform (<200ms to interactive) rather than a mount. When closed it is `inert`
 * and `visibility:hidden` (after the slide finishes) so it can't be tabbed into.
 * Spring: { 350ms, 0.88 }.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  right,
  tall,
  testId,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  right?: ReactNode
  tall?: boolean
  testId?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // `inert` isn't in React's DOM types for all versions; set it imperatively.
  useEffect(() => {
    const el = panel.current
    if (!el) return
    if (open) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [open])

  // Focus: move into the dialog when it opens (declared AFTER the inert effect: an inert panel can't take focus) (the panel itself — no keyboard is summoned), return to the opener on close,
  // and keep Tab inside while it's open.
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      panel.current?.focus({ preventScroll: true })
    } else if (returnTo.current) {
      returnTo.current.focus?.({ preventScroll: true })
      returnTo.current = null
    }
  }, [open])
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return
    const f = [...panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (f.length === 0) return
    const first = f[0]!
    const last = f[f.length - 1]!
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }


  // Drag the grabber down to dismiss.
  const drag = useRef<{ y: number; dy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.y)
    panel.current.style.transition = 'none'
    panel.current.style.transform = `translateY(${drag.current.dy}px)`
  }
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return
    const { dy } = drag.current
    drag.current = null
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    if (dy > 90) onClose()
  }

  return (
    <div className={cn('fixed inset-0 z-40', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open} data-testid={testId} data-open={open}>
      <div
        className="absolute inset-0 bg-[var(--scrim)]"
        style={{ opacity: open ? 1 : 0, transition: 'opacity var(--dur-sheet) ease-out' }}
        onClick={onClose}
      />
      <div
        ref={panel}
        tabIndex={-1}
        onKeyDown={trapTab}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Sheet'}
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[520px] flex-col rounded-t-[22px] bg-bg outline-none',
          tall ? 'h-[92dvh]' : 'max-h-[92dvh]',
        )}
        style={{
          transform: open ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform var(--dur-sheet) var(--ease-sheet), visibility 0s linear ' + (open ? '0s' : 'var(--dur-sheet)'),
          visibility: open ? 'visible' : 'hidden',
          boxShadow: '0 -1px 0 var(--hairline)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div
          className="flex shrink-0 touch-none flex-col items-center pt-2.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="h-1 w-9 rounded-full bg-hairline" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-2 pb-1">
          <h2 className="t-title min-w-0 truncate">{title}</h2>
          <div className="flex items-center gap-1">
            {right}
            <IconButton icon="x" label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
      </div>
    </div>
  )
}
