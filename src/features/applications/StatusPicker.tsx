import type { ApplicationStatus } from '@/lib/enums'
import { nextStates } from '@/domain/applicationsFsm'
import { Chip } from '@/ui/primitives'

const LABEL: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  APPLIED: 'Mark applied',
  OA: 'Online assessment',
  INTERVIEW: 'Interview',
  OFFER: 'Got an offer',
  REJECTED: 'Rejected',
  GHOSTED: 'No reply (ghosted)',
}
const SELF_LOOP: Partial<Record<ApplicationStatus, string>> = { OA: 'Another assessment', INTERVIEW: 'Next round' }

/**
 * The status picker is built from nextStates(current) and NOTHING ELSE. It deliberately accepts only the
 * current status — no component can be handed an arbitrary target — so an illegal transition is
 * unreachable in the UI, not merely rejected afterwards.
 */
export function StatusPicker({ current, onAdvance }: { current: ApplicationStatus; onAdvance: (to: ApplicationStatus) => void }) {
  const moves = nextStates(current)
  if (moves.length === 0) return <span className="t-meta text-ink-2">Closed — nothing further.</span>
  return (
    <div role="group" aria-label="Move to" className="flex flex-wrap gap-2">
      {moves.map((to) => (
        <Chip key={to} onClick={() => onAdvance(to)} data-testid={`advance-${to}`}>
          {to === current ? (SELF_LOOP[to] ?? LABEL[to]) : LABEL[to]}
        </Chip>
      ))}
    </div>
  )
}
