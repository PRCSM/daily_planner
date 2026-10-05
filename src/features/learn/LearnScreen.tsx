import { useMemo } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { getLearnBundle } from '@/data/repos/bundles'
import { setQuoteSaved } from '@/data/repos/learn'
import { packForWeek, quoteForDate } from '@/domain/quotes'
import { weekFor } from '@/domain/weeks'
import { TRACK_LABEL } from '@/lib/enums'
import { Button, Card, IconButton, Note, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { useToday } from '@/features/useToday'
import { useOnline } from '@/features/useOnline'

/** Learn: one quote a day, today's pack, a library, and chat. No feed, no recommendations — a pack ENDS. */
export function LearnScreen() {
  const today = useToday()
  const online = useOnline()
  const data = useLiveQuery(() => getLearnBundle(), [])
  const view = useMemo(() => {
    if (!data) return null
    const week = weekFor(data.weeks, today)
    const completed = new Set(data.progress.filter((p) => p.completed).map((p) => p.packId))
    const todays = week ? packForWeek(data.packs, week.topics, week.weekNumber, completed) : undefined
    const progress = todays ? data.progress.filter((p) => p.packId === todays.id).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined
    const packs = [...data.packs].sort((a, b) => (a.weekNumber ?? 99) - (b.weekNumber ?? 99) || a.title.localeCompare(b.title))
    return { quote: quoteForDate(data.quotes, today), week, todays, progress, packs, completed }
  }, [data, today])

  if (!view) return <Screen>{null}</Screen>
  const { quote, todays, progress, packs } = view

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

      <SectionLabel>Library</SectionLabel>
      <ul className="grid grid-cols-2 gap-2" data-testid="library">
        {packs.map((p) => (
          <li key={p.id}>
            <Link to={`/learn/pack/${p.id}`} className="press flex h-full min-h-[116px] flex-col rounded-[14px] bg-surface p-4">
              <span className="t-meta text-ink-2">{p.track ? TRACK_LABEL[p.track] : 'Pack'}{p.weekNumber ? ` · W${p.weekNumber}` : ''}</span>
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
