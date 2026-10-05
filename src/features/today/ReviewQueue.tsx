import type { DsaProblemRow } from '@/data/types'
import { daysOverdue } from '@/domain/spaced'
import { Button, Card, Pill } from '@/ui/primitives'
import { reviewDsaProblem } from '@/features/services/logging'

/**
 * The spaced-repetition review queue. Rendered ONLY when something is due — callers must not
 * render an empty state: a daily "nothing due" trains you to ignore the one widget that must
 * stay alarming. Overdue renders in danger; due-today is neutral.
 */
export function ReviewQueue({ items, today }: { items: DsaProblemRow[]; today: string }) {
  if (items.length === 0) return null
  const overdue = items.some((p) => daysOverdue(p.reviewDue!, today) > 0)
  return (
    <Card tone={overdue ? 'danger' : 'surface'} className="mb-6" data-testid="review-queue" aria-label="Review queue">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="t-heading">Review due</h2>
        <Pill tone={overdue ? 'danger' : 'neutral'}>{items.length}</Pill>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((p) => {
          const late = daysOverdue(p.reviewDue!, today)
          return (
            <li key={p.id} className="flex items-center gap-3" data-testid="review-item">
              <div className="min-w-0 flex-1">
                <div className="t-body-strong truncate">{p.title}</div>
                <div className="t-meta text-ink-2">
                  {p.pattern} · {late > 0 ? <span className="text-danger">{late}d overdue</span> : 'due today'}
                </div>
              </div>
              <Button variant="secondary" className="!min-h-9 !px-3.5" onClick={() => void reviewDsaProblem(p.id, true, today)} aria-label={`${p.title}: solved cleanly`}>
                Clean
              </Button>
              <Button variant="secondary" className="!min-h-9 !px-3.5" onClick={() => void reviewDsaProblem(p.id, false, today)} aria-label={`${p.title}: needed help`}>
                Needed help
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
