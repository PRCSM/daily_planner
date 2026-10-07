import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { getLearnBundle } from '@/data/repos/bundles'
import { setQuoteSaved } from '@/data/repos/learn'
import { capgToday } from '@/domain/capgemini'
import { formatDay } from '@/domain/dates'
import { packForWeek, quoteForDate } from '@/domain/quotes'
import { weekFor } from '@/domain/weeks'
import { CAPG_DAYS, CAPG_KINDS, CAPG_KIND_LABEL, CAPG_KIND_NAME, type CapgKind, capgKindOf, isCapgTags } from '@/lib/capgemini'
import { TRACK_LABEL } from '@/lib/enums'
import { Button, Card, IconButton, Note, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { ChipGroup } from '@/ui/controls'
import { Icon } from '@/ui/Icon'
import { useToday } from '@/features/useToday'
import { useOnline } from '@/features/useOnline'
import type { ContentPackRow } from '@/data/types'

/** Learn: one quote a day, today's pack, a library, and chat. No feed, no recommendations — a pack ENDS. */
export function LearnScreen() {
  const today = useToday()
  const online = useOnline()
  const data = useLiveQuery(() => getLearnBundle(), [])
  const [scope, setScope] = useState<Scope>('CORE')
  const [kind, setKind] = useState<CapgKind | 'ALL'>('ALL')
  const libraryTop = useRef<HTMLDivElement>(null)
  const view = useMemo(() => {
    if (!data) return null
    const week = weekFor(data.weeks, today)
    const completed = new Set(data.progress.filter((p) => p.completed).map((p) => p.packId))
    // The exam-prep packs have their own day card; they must never be picked as the generic "today's pack".
    const todays = week ? packForWeek(data.packs.filter((p) => !isCapgTags(p.tags)), week.topics, week.weekNumber, completed) : undefined
    const progress = todays ? data.progress.filter((p) => p.packId === todays.id).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined
    const packs = [...data.packs].sort((a, b) => (a.weekNumber ?? 99) - (b.weekNumber ?? 99) || a.title.localeCompare(b.title))
    return { quote: quoteForDate(data.quotes, today), week, todays, progress, packs, completed, capg: capgToday(data.packs, data.exam, today), examDate: data.exam?.date }
  }, [data, today])

  if (!view) return <Screen>{null}</Screen>
  const { quote, todays, progress, packs, capg } = view
  const shown = packs.filter((p) => (scope === 'ALL' ? true : scope === 'CAPG' ? isCapgTags(p.tags) && (kind === 'ALL' || capgKindOf(p.tags) === kind) : !isCapgTags(p.tags)))
  const browseCapgemini = () => {
    setScope('CAPG')
    libraryTop.current?.scrollIntoView?.()
  }

  return (
    <Screen>
      <ScreenTitle sub={view.week ? `Week ${view.week.weekNumber} · ${view.week.topics.slice(0, 3).join(' · ')}` : undefined}>learn</ScreenTitle>

      {quote ? (
        <Card className="mb-2" data-testid="quote">
          <blockquote>
            <p className="t-reader">“{quote.text}”</p>
            <footer className="t-label mt-3 flex items-start justify-between gap-3 text-ink-2">
              <span>{quote.author ? <><span className="text-ink">{quote.author}</span> · </> : null}{quote.source}</span>
              <IconButton icon="bookmark" label={quote.saved ? 'Unsave quote' : 'Save quote'} size={18} className={`!size-9 shrink-0 ${quote.saved ? '!text-ink' : ''}`} aria-pressed={quote.saved} onClick={() => void setQuoteSaved(quote.id, !quote.saved)} />
            </footer>
          </blockquote>
        </Card>
      ) : null}

      {capg.window === 'ACTIVE' || capg.daysToExam !== null ? (
        <>
          <SectionLabel>Capgemini prep</SectionLabel>
          <Card data-testid="capg-card">
            <div className="t-meta text-ink-2">
              {capg.window === 'ACTIVE' ? `Day ${capg.day} of ${CAPG_DAYS}` : capg.window === 'BEFORE' ? 'The prep window has not started' : `The ${CAPG_DAYS}-day window has ended`}
              {capg.daysToExam !== null ? ` · ${capg.daysToExam === 0 ? 'the exam is today' : capg.daysToExam === 1 ? '1 day to the exam' : `${capg.daysToExam} days to the exam`}${view.examDate ? ` (${formatDay(view.examDate, 'ddd D MMM')})` : ''}` : ''}
            </div>
            {capg.examUnconfirmed && capg.daysToExam !== null ? <p className="t-meta mt-1 text-ink-2">That date is a placeholder — confirm it from your invitation and edit it in Calendar.</p> : null}
            <PackRows label="Learn" packs={capg.lessons} completed={view.completed} />
            <PackRows label="Drills" packs={capg.drills} completed={view.completed} />
            <PackRows label="Practice" packs={capg.practice} completed={view.completed} />
            {capg.window === 'ACTIVE' && !capg.lessons.length && !capg.drills.length && !capg.practice.length ? <Note className="mt-3">Nothing scheduled for today.</Note> : null}
            <Button variant="secondary" className="mt-4" onClick={browseCapgemini}>Browse all Capgemini packs</Button>
          </Card>
        </>
      ) : null}

      <SectionLabel>Today’s pack</SectionLabel>
      {todays ? (
        <Card data-testid="todays-pack">
          <div className="t-meta mb-1 flex items-center gap-2 text-ink-2">
            {todays.track ? TRACK_LABEL[todays.track] : 'Pack'} · {todays.totalCards} cards · {todays.estimatedMinutes} min
          </div>
          <h2 className="t-title">{todays.title}</h2>
          <p className="t-body mt-1 text-ink-2">{todays.summary}</p>
          <div className="mt-4 flex items-center gap-3">
            <Link to={`/learn/pack/${todays.id}`}>
              <Button>{progress && progress.cardsViewed > 0 && !progress.completed ? `Resume · ${progress.cardsViewed}/${todays.totalCards}` : progress?.completed ? 'Read again' : 'Start'}</Button>
            </Link>
            {progress?.completed ? <Pill tone="outline">finished</Pill> : null}
          </div>
        </Card>
      ) : (
        <Card>
          <Note>No pack matches this week’s topics yet. Browse the library below{online ? ', or generate one in chat.' : '.'}</Note>
        </Card>
      )}

      <SectionLabel>Ask</SectionLabel>
      <Link to="/learn/chat" className="press flex items-center gap-3 rounded-[14px] bg-surface p-4" data-testid="chat-link">
        <span className="flex size-10 items-center justify-center rounded-full bg-raised"><Icon name="sparkle" size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="t-body-strong block">Chat &amp; generate a pack</span>
          <span className="t-label block text-ink-2">{online ? 'Ask a question or turn a topic into a short pack.' : 'Needs a connection — everything else here works offline.'}</span>
        </span>
        <Icon name="chevron-right" size={18} className="text-ink-3" />
      </Link>

      <div ref={libraryTop} />
      <SectionLabel>Library</SectionLabel>
      <ChipGroup
        label="Library scope"
        className="mb-2"
        options={SCOPES}
        value={scope}
        onChange={setScope}
        render={(o) => SCOPE_LABEL[o]}
      />
      {scope === 'CAPG' ? <ChipGroup label="Capgemini pack kind" className="mb-3" options={['ALL', ...CAPG_KINDS] as const} value={kind} onChange={setKind} render={(o) => (o === 'ALL' ? 'All' : CAPG_KIND_LABEL[o])} /> : null}
      <p className="t-meta mb-2 text-ink-2" aria-live="polite">{shown.length} pack{shown.length === 1 ? '' : 's'}</p>
      <ul className="grid grid-cols-2 gap-2" data-testid="library">
        {shown.map((p) => (
          <li key={p.id}>
            <Link to={`/learn/pack/${p.id}`} className="press flex h-full min-h-[116px] flex-col rounded-[14px] bg-surface p-4">
              <span className="t-meta text-ink-2">{tileCaption(p)}{p.weekNumber ? ` · W${p.weekNumber}` : ''}</span>
              <span className="t-body-strong mt-1 flex-1">{p.title}</span>
              <span className="t-meta mt-2 flex items-center justify-between text-ink-2">
                <span>{p.totalCards} cards · {p.estimatedMinutes}m</span>
                {view.completed.has(p.id) ? <Icon name="check" size={14} /> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  )
}

type Scope = 'CORE' | 'CAPG' | 'ALL'
const SCOPES: readonly Scope[] = ['CORE', 'CAPG', 'ALL']
const SCOPE_LABEL: Record<Scope, string> = { CORE: 'Core plan', CAPG: 'Capgemini', ALL: 'All' }

function tileCaption(p: ContentPackRow): string {
  const k = capgKindOf(p.tags)
  return k ? CAPG_KIND_NAME[k] : p.track ? TRACK_LABEL[p.track] : 'Pack'
}

function PackRows({ label, packs, completed }: { label: string; packs: ContentPackRow[]; completed: ReadonlySet<string> }) {
  if (!packs.length) return null
  return (
    <section className="mt-4">
      <h3 className="t-label mb-1.5 text-ink-2">{label}</h3>
      <ul className="flex flex-col gap-1.5" aria-label={`${label} for today`}>
        {packs.map((p) => (
          <li key={p.id}>
            <Link to={`/learn/pack/${p.id}`} className="press flex items-center gap-3 rounded-[12px] bg-raised px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="t-body block truncate">{p.title}</span>
                <span className="t-meta block text-ink-2">{p.totalCards} cards · {p.estimatedMinutes} min</span>
              </span>
              {completed.has(p.id) ? <Icon name="check" size={16} aria-label="finished" /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
