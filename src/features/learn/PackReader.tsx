import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { cardsForPack, getPack, saveProgress } from '@/data/repos/learn'
import { splitCheck } from '@/domain/markdown'
import type { ContentCardRow } from '@/data/types'
import { Button, IconButton, Note, Pill } from '@/ui/primitives'
import { CodeBlock, Prose } from '@/ui/Prose'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { useToday } from '@/features/useToday'

const TYPE_LABEL: Record<ContentCardRow['type'], string> = { HOOK: 'The hook', CONCEPT: 'The idea', EXAMPLE: 'An example', CODE: 'In code', ANALOGY: 'An analogy', WARNING: 'Watch out', CHECK: 'Check yourself', SUMMARY: 'To remember' }

/**
 * The reader: ONE card per screen, serif body, the next card's edge peeking (horizontal scroll-snap).
 * A pack ENDS (the last card is the summary) — there is no “next recommended” and no feed.
 */
export function PackReader() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const today = useToday()
  // null = not found, undefined = still loading
  const pack = useLiveQuery(async () => (await getPack(id)) ?? null, [id])
  const cards = useLiveQuery(() => cardsForPack(id), [id])
  const [index, setIndex] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const started = useRef(performance.now())
  const maxSeen = useRef(0)

  const total = cards?.length ?? 0

  // Persist progress as cards are viewed (one row per pack per day).
  useEffect(() => {
    if (!cards || cards.length === 0) return
    if (index + 1 <= maxSeen.current) return
    maxSeen.current = index + 1
    void saveProgress(id, today, { cardsViewed: maxSeen.current, cardsTotal: cards.length, completed: maxSeen.current >= cards.length, minutesSpent: Math.max(1, Math.round((performance.now() - started.current) / 60000)) })
  }, [index, cards, id, today])

  const go = (i: number) => {
    const el = scroller.current
    if (!el || !cards) return
    const clamped = Math.max(0, Math.min(cards.length - 1, i))
    const child = el.children[clamped] as HTMLElement | undefined
    child?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    setIndex(clamped)
  }
  const onScroll = () => {
    const el = scroller.current
    if (!el || !el.children.length) return
    const first = el.children[0] as HTMLElement
    const step = first.offsetWidth + 12
    if (step > 12) setIndex(Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / step))))
  }

  if (pack === undefined || cards === undefined) return <div className="p-5" />
  if (!pack) {
    return (
      <div className="mx-auto max-w-[520px] p-5">
        <h1 className="t-title">Pack not found</h1>
        <Link to="/learn" className="t-label mt-3 inline-block underline">Back to Learn</Link>
      </div>
    )
  }
  const done = index === total - 1

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[520px] flex-col" onKeyDown={(e) => (e.key === 'ArrowRight' ? go(index + 1) : e.key === 'ArrowLeft' ? go(index - 1) : undefined)}>
      <header className="flex items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <IconButton icon="chevron-left" label="Back to Learn" onClick={() => nav('/learn')} />
        <div className="min-w-0 flex-1">
          <div className="t-label truncate font-bold">{pack.title}</div>
          <div className="t-meta text-ink-2" aria-live="polite">Card {Math.min(index + 1, total)} of {total}</div>
        </div>
        <IconButton icon="sparkle" label="Ask about this card" onClick={() => nav(`/learn/chat?pack=${id}&card=${index}`)} />
      </header>

      <div className="flex gap-1 px-5 pb-3" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label="Pack progress">
        {cards.map((c, i) => <span key={c.id} className={cn('h-1 flex-1 rounded-full', i <= index ? 'bg-ink' : 'bg-raised')} />)}
      </div>

      <div ref={scroller} onScroll={onScroll} className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4" data-testid="reader-track">
        {cards.map((c, i) => <CardView key={c.id} card={c} active={i === index} />)}
      </div>

      <footer className="flex items-center justify-between gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous card" icon="chevron-left">Back</Button>
        {done ? (
          <Button onClick={() => nav('/learn')} icon="check">Finish</Button>
        ) : (
          <Button onClick={() => go(index + 1)} aria-label="Next card">Next <Icon name="chevron-right" size={18} /></Button>
        )}
      </footer>
    </div>
  )
}

function CardView({ card, active }: { card: ContentCardRow; active: boolean }) {
  const [revealed, setRevealed] = useState(false)
  const check = card.type === 'CHECK' ? splitCheck(card.body) : null
  return (
    <article className={cn('flex w-[88%] shrink-0 snap-center flex-col overflow-y-auto rounded-[18px] bg-surface p-6', !active && 'opacity-80')} aria-label={card.heading ?? TYPE_LABEL[card.type]} data-testid="reader-card">
      <Pill tone="outline" className="self-start">{TYPE_LABEL[card.type]}</Pill>
      {card.heading ? <h2 className="t-title mt-3">{card.heading}</h2> : null}
      <div className="t-reader mt-3">
        {check ? (
          <>
            <Prose text={check.question} />
            {check.answer ? (
              revealed ? <div className="mt-4 rounded-[12px] bg-raised p-4" data-testid="check-answer"><Prose text={check.answer} /></div>
              : <Button variant="secondary" className="mt-4" onClick={() => setRevealed(true)}>Reveal the answer</Button>
            ) : null}
          </>
        ) : (
          <Prose text={card.body} />
        )}
      </div>
      {card.codeSnippet ? <div className="mt-4"><CodeBlock code={card.codeSnippet} lang={card.codeLang} /></div> : null}
      {card.type === 'SUMMARY' ? <Note className="mt-5">That’s the pack. It ends here.</Note> : null}
    </article>
  )
}
