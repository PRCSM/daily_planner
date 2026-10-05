import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allApplications } from '@/data/repos/applications'
import { FUNNEL_ORDER, statusCensus } from '@/domain/applicationsFsm'
import { daysSinceApplied, isFollowUpDue } from '@/domain/applications'
import { relativeDay } from '@/domain/dates'
import { Card, IconButton, Note, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { advanceApplication } from '@/features/services/applications'
import { StatusPicker } from './StatusPicker'
import type { ApplicationRow } from '@/data/types'
import type { ApplicationStatus } from '@/lib/enums'

const STATUS_LABEL: Record<ApplicationStatus, string> = { SAVED: 'Saved', APPLIED: 'Applied', OA: 'Online assessment', INTERVIEW: 'Interview', OFFER: 'Offer', REJECTED: 'Rejected', GHOSTED: 'Ghosted' }

export function ApplicationsScreen() {
  const today = useToday()
  const openSheet = useUi((s) => s.openSheet)
  const apps = useLiveQuery(() => allApplications(), [])
  const census = useMemo(() => statusCensus(apps ?? []), [apps])
  const groups = useMemo(() => FUNNEL_ORDER.map((s) => ({ status: s, items: (apps ?? []).filter((a) => a.status === s).sort((a, b) => (b.appliedDate ?? '').localeCompare(a.appliedDate ?? '') || a.company.localeCompare(b.company)) })).filter((g) => g.items.length), [apps])

  return (
    <Screen>
      <ScreenTitle right={<IconButton icon="plus" label="Save application" className="bg-surface" onClick={() => openSheet('application')} />}>applications</ScreenTitle>

      {/* A CENSUS of where things stand NOW — not a conversion funnel (status history isn't stored). Zeros are shown. */}
      <Card className="mb-2" data-testid="census">
        <div className="grid grid-cols-4 gap-y-3 text-center">
          {FUNNEL_ORDER.map((s) => (
            <div key={s}>
              <div className="t-title tabular-nums" data-testid={`census-${s}`}>{census[s]}</div>
              <div className="t-meta text-ink-2">{STATUS_LABEL[s]}</div>
            </div>
          ))}
        </div>
        <p className="t-meta mt-3 text-ink-2">Where everything stands right now. Not a conversion funnel: status history isn’t stored, so “how many of my applications reached an interview” can’t be answered honestly.</p>
      </Card>

      {apps && apps.length === 0 ? <Note className="mt-4">Nothing tracked yet. Save one from the + button, or from an opportunity.</Note> : null}

      {groups.map((g) => (
        <section key={g.status} aria-label={STATUS_LABEL[g.status]}>
          <SectionLabel right={<span className="t-meta text-ink-2">{g.items.length}</span>}>{STATUS_LABEL[g.status]}</SectionLabel>
          <ul className="flex flex-col gap-2">
            {g.items.map((a) => (
              <li key={a.id}>
                <AppCard a={a} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Screen>
  )
}

function AppCard({ a, today }: { a: ApplicationRow; today: string }) {
  const openSheet = useUi((s) => s.openSheet)
  const due = isFollowUpDue(a, today)
  const since = daysSinceApplied(a, today)
  return (
    <Card data-testid="application-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="t-body-strong truncate">{a.company}</div>
          <div className="t-label text-ink-2">{a.role}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {since !== null ? <Pill>applied {since === 0 ? 'today' : `${since}d ago`}</Pill> : null}
            {a.nextFollowUp ? <Pill tone={due ? 'warning' : 'outline'}>follow up {relativeDay(a.nextFollowUp, today)}</Pill> : null}
            {a.resumeVariant ? <Pill tone="outline">{a.resumeVariant}</Pill> : null}
          </div>
        </div>
        {a.url ? (
          <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.company} posting`} className="press flex size-9 items-center justify-center text-ink-2">
            <Icon name="link" size={16} />
          </a>
        ) : null}
        <IconButton icon="edit" label={`Edit ${a.company}`} size={16} className="!size-9" onClick={() => openSheet('application', { id: a.id })} />
      </div>
      <div className="mt-3">
        <StatusPicker current={a.status} onAdvance={(to) => void advanceApplication(a.id, to, today)} />
      </div>
    </Card>
  )
}
