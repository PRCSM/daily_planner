import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDeliverable, getReview, setDeliverableDone } from '@/data/repos/plan'
import { createNote, notesLinkedTo } from '@/data/repos/notes'
import { formatDay } from '@/domain/dates'
import { PHASE_LABEL } from '@/lib/enums'
import { Card, CardList, IconButton, Note, Pill, Row, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Checkbox, TriState } from '@/ui/controls'
import { LiveText } from '@/features/common/bits'
import { useToday } from '@/features/useToday'
import { saveWeeklyReview } from '@/features/services/plan'
import { weekVerdict } from '@/domain/progress'
import { burnoutActive } from '@/domain/burnout'
import { usePlan } from './usePlan'
import { BurnoutCard } from './PlanScreen'
import { useState } from 'react'

export function WeekScreen() {
  const { n } = useParams()
  const num = Number(n)
  const today = useToday()
  const plan = usePlan(today)
  const nav = useNavigate()
  const linked = useLiveQuery(() => (Number.isInteger(num) ? notesLinkedTo('WEEK', String(num)) : []), [num], [])
  const review = useLiveQuery(() => (Number.isInteger(num) ? getReview(num) : undefined), [num])
  const [newItem, setNewItem] = useState('')

  if (!plan) return <Screen>{null}</Screen>
  const row = plan.rows.find((r) => r.week.weekNumber === num)
  if (!row) {
    return (
      <Screen>
        <ScreenTitle>week?</ScreenTitle>
        <Note>There is no week “{n}”. The plan has weeks 1–{plan.rows.length}.</Note>
        <Link to="/plan" className="t-label mt-3 inline-block underline">Back to the plan</Link>
      </Screen>
    )
  }
  const { week } = row
  const items = plan.deliverables.filter((d) => d.weekNumber === num)
  const isCurrent = row.state === 'CURRENT'
  const v = weekVerdict(week, week.dsaTarget, row.dsa.actual, today)
  const showBurnout = burnoutActive(plan.reviews, num) && (isCurrent || row.state === 'PAST')

  return (
    <Screen>
      <ScreenTitle sub={`${formatDay(week.startDate, 'D MMM')} – ${formatDay(week.endDate, 'D MMM')} · ${PHASE_LABEL[week.phase]}`} right={<Link to="/plan" aria-label="Back to plan"><Pill tone="outline">all weeks</Pill></Link>}>
        week {week.weekNumber}
      </ScreenTitle>

      {showBurnout ? <BurnoutCard dsaTarget={week.dsaTarget} appTarget={week.applicationTarget} /> : null}

      <Card className="mb-2">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {week.topics.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={`t-title tabular-nums ${row.dsa.verdict === 'BEHIND' ? 'text-danger' : ''}`}>{row.dsa.actual}<span className="text-ink-2">/{week.dsaTarget}</span></div>
            <div className="t-meta text-ink-2">DSA problems</div>
          </div>
          <div>
            <div className={`t-title tabular-nums ${row.apps.verdict === 'BEHIND' ? 'text-danger' : ''}`}>{row.apps.actual}<span className="text-ink-2">/{week.applicationTarget}</span></div>
            <div className="t-meta text-ink-2">applications</div>
          </div>
        </div>
        {/* The honest line: judged pro-rata mid-week, never a verdict on the future. */}
        <p className="t-label mt-3 text-ink-2" data-testid="verdict-line">
          {row.state === 'FUTURE'
            ? 'Not started — no verdict yet.'
            : isCurrent
              ? `Pro-rata: expected ${v.expected} by now, you have ${v.actual}.`
              : v.verdict === 'BEHIND'
                ? `Finished ${v.shortBy} short of the target.`
                : 'Target met.'}
        </p>
      </Card>

      <SectionLabel>Deliverables</SectionLabel>
      <CardList>
        {items.map((d) => (
          <Row key={d.id} leading={<Checkbox label={`Done: ${d.text}`} checked={d.done} onChange={(c) => void setDeliverableDone(d.id, c)} />} dim={d.done} right={d.dueDate ? <Pill>{formatDay(d.dueDate, 'D MMM')}</Pill> : undefined}>
            {d.text}
          </Row>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newItem.trim()) return
            void addDeliverable(num, newItem.trim()).then(() => setNewItem(''))
          }}
        >
          <input aria-label="New deliverable" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a deliverable" className="t-body w-full rounded-[12px] bg-surface px-3.5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent" />
          <IconButton icon="plus" label="Add deliverable" className="bg-surface" type="submit" />
        </form>
      </CardList>

      <SectionLabel right={<button type="button" className="t-label press text-ink-2 underline" onClick={async () => nav(`/notes/${(await createNote('', 'WEEK', String(num))).id}`)}>Add note</button>}>Notes</SectionLabel>
      {linked.length ? (
        <CardList>
          {linked.map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className="press t-body block rounded-[14px] bg-surface p-4" data-testid="week-note">{n.title || 'Untitled'}</Link>
          ))}
        </CardList>
      ) : (
        <Note>No notes linked to this week.</Note>
      )}

      <SectionLabel>Sunday review</SectionLabel>
      <Card className="flex flex-col gap-3" data-testid="review-form">
        <Q label="1 · DSA — what moved, what stuck?" value={review?.q1Dsa} onSave={(t) => void saveWeeklyReview(num, { q1Dsa: t })} />
        <Q label="2 · Core CS / design — what did you actually understand?" value={review?.q2Core} onSave={(t) => void saveWeeklyReview(num, { q2Core: t })} />
        <Q label="3 · What shipped?" value={review?.q3Shipped} onSave={(t) => void saveWeeklyReview(num, { q3Shipped: t })} />
        <Q label="4 · Applications — sent vs target" value={review?.q4Applications} onSave={(t) => void saveWeeklyReview(num, { q4Applications: t })} />
        <div>
          <div className="t-label mb-2 text-ink-2">5 · Sleep, training and rest were OK this week</div>
          {/* A real three-state control: neither chip selected by default; tap the selected one to clear. */}
          <TriState label="Fuel was OK" value={review?.q5FuelOk ?? null} onChange={(v) => void saveWeeklyReview(num, { q5FuelOk: v })} yesLabel="Yes, fuelled" noLabel="No, ran on empty" />
          <p className="t-meta mt-2 text-ink-2">Two “no” answers in a row trigger a lighter week. Leaving it blank never counts as no.</p>
        </div>
      </Card>
    </Screen>
  )
}

function Q({ label, value, onSave }: { label: string; value?: string; onSave: (v: string) => void }) {
  return (
    <div>
      <div className="t-label mb-1.5 text-ink-2">{label}</div>
      <LiveText label={label} value={value ?? ''} onSave={onSave} placeholder="one or two lines" />
    </div>
  )
}
