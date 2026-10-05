import { Link } from 'react-router'
import { formatDay } from '@/domain/dates'
import { phaseSpans } from '@/domain/weeks'
import { reducedTarget } from '@/domain/burnout'
import { PHASE_LABEL } from '@/lib/enums'
import { Card, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { useToday } from '@/features/useToday'
import { usePlan, type WeekRow } from './usePlan'

/** Plan: phase strip, 18 week rows with target-vs-actual, the burnout card. */
export function PlanScreen() {
  const today = useToday()
  const plan = usePlan(today)
  if (!plan) return <Screen><ScreenTitle>plan</ScreenTitle></Screen>
  const spans = phaseSpans(plan.rows.map((r) => r.week))

  return (
    <Screen>
      <ScreenTitle sub={`${plan.totalDone} of ${plan.totalTarget} DSA problems`}>plan</ScreenTitle>

      {plan.burnout && plan.current ? <BurnoutCard dsaTarget={plan.current.dsaTarget} appTarget={plan.current.applicationTarget} /> : null}

      {/* Phase strip: numbered segments (width = weeks), named in the legend below */}
      <div className="mb-6" aria-label="Phases">
        <div className="flex gap-1">
          {spans.map((s, i) => {
            const active = plan.current && plan.current.weekNumber >= s.firstWeek && plan.current.weekNumber <= s.lastWeek
            return (
              <div key={s.phase} style={{ flex: s.weeks }} className="min-w-0" title={PHASE_LABEL[s.phase]}>
                <div className={cn('h-2 rounded-full', active ? 'bg-ink' : 'bg-raised')} />
                <div className={cn('t-meta mt-1.5 text-center tabular-nums', active ? 'text-ink' : 'text-ink-2')}>{i + 1}</div>
              </div>
            )
          })}
        </div>
        <ol className="t-meta mt-2 grid grid-cols-1 gap-0.5 text-ink-2">
          {spans.map((s, i) => (
            <li key={s.phase} className={cn(plan.current && plan.current.weekNumber >= s.firstWeek && plan.current.weekNumber <= s.lastWeek && 'text-ink')}>
              {i + 1} · {PHASE_LABEL[s.phase]} <span className="text-ink-2">(W{s.firstWeek}{s.lastWeek > s.firstWeek ? `–${s.lastWeek}` : ''})</span>
            </li>
          ))}
        </ol>
      </div>

      <SectionLabel>Weeks</SectionLabel>
      <ul className="flex flex-col gap-2">
        {plan.rows.map((r) => (
          <li key={r.week.id}>
            <WeekRowCard row={r} current={plan.current?.weekNumber === r.week.weekNumber} />
          </li>
        ))}
      </ul>
    </Screen>
  )
}

export function BurnoutCard({ dsaTarget, appTarget }: { dsaTarget: number; appTarget: number }) {
  // NON-DISMISSIBLE: no close button, by design. It lapses when a week's fuel answer is an explicit yes.
  return (
    <Card tone="danger" className="mb-6" role="alert" data-testid="burnout-card">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="alert" size={18} className="text-danger" />
        <h2 className="t-heading">Cut the plan 25% this week.</h2>
      </div>
      <p className="t-body text-ink-2">
        Two Sunday reviews in a row said sleep, training or rest wasn’t okay. This week aim for {reducedTarget(dsaTarget)} DSA problems (not {dsaTarget})
        {appTarget > 0 ? ` and ${reducedTarget(appTarget)} applications (not ${appTarget})` : ''}. Protect sleep first.
      </p>
    </Card>
  )
}

function Metric({ label, v }: { label: string; v: WeekRow['dsa'] }) {
  // BEHIND is the only coloured state. On track is UNCOLOURED; future weeks show the target and NO verdict.
  const behind = v.verdict === 'BEHIND'
  return (
    <div className="text-right">
      <div className={cn('t-body-strong tabular-nums', behind && 'text-danger')}>
        {v.verdict === null ? <span className="text-ink-2">{v.target}</span> : <>{v.actual}<span className="text-ink-2">/{v.target}</span></>}
      </div>
      <div className="t-meta text-ink-2">{label}{behind && v.shortBy > 0 ? <span className="text-danger"> · −{v.shortBy}</span> : ''}</div>
    </div>
  )
}

function WeekRowCard({ row, current }: { row: WeekRow; current: boolean }) {
  const { week } = row
  return (
    <Link to={`/plan/week/${week.weekNumber}`} className="press flex items-center gap-3 rounded-[14px] bg-surface p-4" aria-label={`Week ${week.weekNumber}`}>
      <div className="w-10 shrink-0">
        <div className="t-body-strong flex items-center gap-1.5">
          W{week.weekNumber}
          {current ? <span className="size-1.5 rounded-full bg-accent" aria-label="current week" /> : null}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="t-body truncate">{week.topics.slice(0, 3).join(' · ')}</div>
        <div className="t-meta text-ink-2">
          {formatDay(week.startDate, 'D MMM')} – {formatDay(week.endDate, 'D MMM')}
        </div>
      </div>
      <Metric label="DSA" v={row.dsa} />
      <Metric label="apps" v={row.apps} />
    </Link>
  )
}

