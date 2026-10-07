import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listEventsByTypes } from '@/data/repos/events'
import { allPortals } from '@/data/repos/portals'
import { groupOpportunities, type OppRow } from '@/domain/opportunities'
import { formatDay } from '@/domain/dates'
import { OPPORTUNITY_TYPES } from '@/domain/opportunities'
import { Card, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Collapsible } from '@/features/common/bits'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { FitPill } from './FitPill'

const range = (e: OppRow['event']) => (e.endDate && e.endDate !== e.date ? `${formatDay(e.date, 'D MMM')} – ${formatDay(e.endDate, 'D MMM')}` : formatDay(e.date, 'D MMM'))

export function OpportunitiesScreen() {
  const today = useToday()
  const events = useLiveQuery(() => listEventsByTypes([...OPPORTUNITY_TYPES]), [])
  const portals = useLiveQuery(() => allPortals(), [])
  const months = useMemo(() => groupOpportunities(events ?? [], today), [events, today])

  return (
    <Screen>
      <ScreenTitle sub="Windows, hackathons, open source — with the judgement attached">opportunities</ScreenTitle>
      <p className="t-label mb-2 px-1 text-ink-2" data-testid="dates-note">Dates are typical windows, not promises — confirm the exact dates on each official page.</p>
      {months.map((m) => (
        <section key={m.key} aria-label={m.label}>
          <SectionLabel>{m.label}</SectionLabel>
          <div className="flex flex-col gap-2">
            {m.groups.map((g) => (
              <div key={g.rows[0]!.event.id} className="flex flex-col gap-2" data-testid={g.sharedCaveat ? 'caveat-group' : undefined}>
                {/* One caveat, shown ONCE above its group — repeated five times it would just get skimmed. */}
                {g.sharedCaveat ? (
                  <p className="t-label flex items-start gap-2 rounded-[12px] border border-hairline px-3 py-2.5 text-ink-2" data-testid="shared-caveat">
                    <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                    {g.sharedCaveat}
                  </p>
                ) : null}
                {g.rows.map((r) => (
                  <OppCard key={r.event.id} r={r} showCaveat={!g.sharedCaveat} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}

      <SectionLabel>Portals worth watching</SectionLabel>
      <div className="flex flex-col gap-2">
        {(portals ?? []).map((p) => (
          <Collapsible key={p.id} title={<span className="flex items-center gap-2">{p.name}<FitPill fit={p.fitPill} /></span>} right={<span className="t-meta">{p.category}</span>}>
            {p.caveat ? <p className="t-label mb-3 text-ink-2">{p.caveat}</p> : null}
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="t-label inline-flex items-center gap-1 underline underline-offset-2">
              Open {p.name} <Icon name="link" size={14} />
            </a>
          </Collapsible>
        ))}
      </div>
    </Screen>
  )
}

function OppCard({ r, showCaveat }: { r: OppRow; showCaveat: boolean }) {
  const openSheet = useUi((s) => s.openSheet)
  const e = r.event
  return (
    // CLOSED items quieten and sink — they never disappear. Quieter means a muted text colour, never opacity:
    // faded text drops below the 4.5:1 contrast minimum.
    <Card data-testid="opportunity" data-closed={r.closed}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className={cn('t-body-strong', r.closed && 'font-medium text-ink-2')}>{e.title}</div>
          <div className="t-meta mt-0.5 text-ink-2">
            {range(e)}
            {e.criticality === 'HARD' && !r.closed ? ' · hard window' : ''}
          </div>
        </div>
        <FitPill fit={r.fit} />
      </div>
      {showCaveat && e.caveat ? <p className="t-label mt-2.5 text-ink-2">{e.caveat}</p> : null}
      {e.notes ? <p className="t-meta mt-1.5 text-ink-2">{e.notes}</p> : null}
      <div className="mt-3 flex items-center gap-4">
        {e.linkUrl ? (
          <a href={e.linkUrl} target="_blank" rel="noopener noreferrer" className={cn('t-label inline-flex items-center gap-1 underline underline-offset-2', r.closed && 'text-ink-2')}>
            Apply / details <Icon name="link" size={14} />
          </a>
        ) : null}
        {!r.closed ? (
          <button type="button" className="t-label press inline-flex items-center gap-1 text-ink-2" onClick={() => openSheet('application', { company: e.title.split(' — ')[0], url: e.linkUrl, source: 'Opportunities' })}>
            <Icon name="plus" size={14} /> Track it
          </button>
        ) : null}
      </div>
    </Card>
  )
}

