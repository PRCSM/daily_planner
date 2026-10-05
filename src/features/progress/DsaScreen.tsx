import { useMemo } from 'react'
import { Link } from 'react-router'
import { patternMatrix, WEAK_MIN_ATTEMPTS } from '@/domain/progress'
import { DSA_PATTERNS, DSA_STATUS_LABEL, DSA_STATUSES } from '@/lib/enums'
import { Card, NotEnoughData, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { useToday } from '@/features/useToday'
import { useProgress } from './useProgress'

/** Pattern coverage matrix. Unaided rate = SOLVED_UNAIDED / total attempts. Never flagged "weak" below 3 attempts. */
export function DsaScreen() {
  const today = useToday()
  const p = useProgress(today)
  const matrix = useMemo(() => (p ? patternMatrix(p.problems, DSA_PATTERNS) : []), [p])
  if (!p) return <Screen>{null}</Screen>
  const dueReviews = p.problems.filter((x) => x.reviewDue && x.reviewDue <= today).length
  const byStatus = Object.fromEntries(DSA_STATUSES.map((s) => [s, p.problems.filter((x) => x.status === s).length]))

  return (
    <Screen>
      <ScreenTitle sub={`${p.problems.length} attempts · ${p.done} done`} right={<Link to="/progress"><Pill tone="outline">progress</Pill></Link>}>dsa</ScreenTitle>

      <Card className="mb-2">
        <div className="grid grid-cols-4 gap-2 text-center">
          {DSA_STATUSES.map((s) => (
            <div key={s}>
              <div className="t-title tabular-nums">{byStatus[s]}</div>
              <div className="t-meta text-ink-2">{DSA_STATUS_LABEL[s]}</div>
            </div>
          ))}
        </div>
        {dueReviews > 0 ? <p className="t-label mt-3 text-danger">{dueReviews} review{dueReviews === 1 ? '' : 's'} overdue — see Today.</p> : null}
      </Card>

      <SectionLabel>Pattern coverage</SectionLabel>
      <div className="overflow-hidden rounded-[14px] bg-surface" role="table" aria-label="Pattern coverage">
        <div role="row" className="t-meta grid grid-cols-[1fr_44px_1fr_64px] gap-2 px-4 py-2 text-ink-2">
          <span role="columnheader">Pattern</span>
          <span role="columnheader" className="text-right">Tried</span>
          <span role="columnheader">Unaided</span>
          <span role="columnheader" />
        </div>
        {matrix.map((m) => (
          <div key={m.pattern} role="row" className="grid grid-cols-[1fr_44px_1fr_64px] items-center gap-2 border-t border-hairline px-4 py-3" data-testid="pattern-row">
            <span role="cell" className="t-label truncate">{m.pattern}</span>
            <span role="cell" className="t-label text-right tabular-nums">{m.attempts}</span>
            <span role="cell">
              {m.unaidedRate === null ? (
                <NotEnoughData>—</NotEnoughData>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden>
                    <span className="block h-full rounded-full bg-ink-2" style={{ width: `${Math.round(m.unaidedRate * 100)}%` }} />
                  </span>
                  <span className="t-meta w-9 text-right tabular-nums">{Math.round(m.unaidedRate * 100)}%</span>
                </span>
              )}
            </span>
            <span role="cell" className="text-right">
              {m.weak ? <Pill tone="warning">weak</Pill> : m.attempts > 0 && m.attempts < WEAK_MIN_ATTEMPTS ? <span className="t-meta text-ink-2">few</span> : null}
            </span>
          </div>
        ))}
      </div>
      <p className="t-meta mt-2 px-1 text-ink-2">A pattern is only called weak after {WEAK_MIN_ATTEMPTS}+ attempts. Fewer than that is just “too early to say”.</p>
    </Screen>
  )
}
