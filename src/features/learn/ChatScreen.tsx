import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMessage, allThreads, cardsForPack, createThread, getPack, messagesFor, removeThread, savePack } from '@/data/repos/learn'
import { allWeeks } from '@/data/repos/plan'
import { askChat, generatePack, AI_MESSAGES, type AiFailure, type AiDeps } from '@/lib/ai'
import { TRACKS, TRACK_LABEL, type Track } from '@/lib/enums'
import { weekFor } from '@/domain/weeks'
import { Button, IconButton, Note, Pill } from '@/ui/primitives'
import { ChipGroup, Stepper, TextArea, TextField } from '@/ui/controls'
import { Prose } from '@/ui/Prose'
import { Sheet } from '@/ui/Sheet'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { Collapsible } from '@/features/common/bits'
import { useOnline } from '@/features/useOnline'
import { useToday } from '@/features/useToday'

/** Test seam: inject the AI transport. Production uses the defaults in lib/ai (the only fetch). */
export interface ChatScreenProps {
  deps?: AiDeps
}

/**
 * Chat + generate. The model's answer is rendered as constrained markdown TEXT and can never drive navigation or
 * writes: the only write is saving a generated pack, which happens after validation, on an explicit button press.
 */
export function ChatScreen({ deps }: ChatScreenProps) {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const online = useOnline()
  const today = useToday()
  const packId = params.get('pack')
  const cardIdx = Number(params.get('card'))
  const pack = useLiveQuery(async () => (packId ? ((await getPack(packId)) ?? null) : null), [packId])
  const cards = useLiveQuery(() => (packId ? cardsForPack(packId) : []), [packId])
  const card = cards && Number.isInteger(cardIdx) ? cards[cardIdx] : undefined

  const [threadId, setThreadId] = useState<string | null>(null)
  const messages = useLiveQuery(() => (threadId ? messagesFor(threadId) : []), [threadId], [])
  const threads = useLiveQuery(allThreads, [], [])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AiFailure | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const context = useMemo(() => {
    if (!pack) return null
    const excerpt = card ? `${card.heading ? `${card.heading}\n` : ''}${card.body}` : undefined
    return { packContext: pack.title, excerpt, label: card ? `${pack.title} · card ${cardIdx + 1}` : pack.title }
  }, [pack, card, cardIdx])

  useEffect(() => bottom.current?.scrollIntoView?.({ block: 'end' }), [messages?.length, busy])

  async function send() {
    const question = text.trim()
    if (!question || busy) return
    setText('') // clear first: keystrokes while the request is in flight belong to the next message
    setError(null)
    setBusy(true)
    try {
      let id = threadId
      if (!id) {
        const t = await createThread(question.slice(0, 48), context ? (card ? 'CARD' : 'PACK') : 'GENERAL', packId ?? undefined, context?.excerpt?.slice(0, 300))
        id = t.id
        setThreadId(id)
      }
      const history = (await messagesFor(id)).map((m) => ({ role: m.role, content: m.content })) // role + content only
      await addMessage(id, 'user', question)
      const r = await askChat({ question, packContext: context?.packContext, excerpt: context?.excerpt, history }, deps)
      if (r.ok) await addMessage(id, 'assistant', r.data.reply)
      else setError(r.reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[520px] flex-col">
      <header className="flex items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <IconButton icon="chevron-left" label="Back" onClick={() => nav(packId ? `/learn/pack/${packId}` : '/learn')} />
        <div className="min-w-0 flex-1">
          <h1 className="t-heading truncate">Chat</h1>
          {context ? <div className="t-meta truncate text-ink-2">About: {context.label}</div> : <div className="t-meta text-ink-2">Ask anything about your prep</div>}
        </div>
        <IconButton icon="list" label="Chat history" onClick={() => setHistoryOpen(true)} />
        <IconButton icon="plus" label="New chat" onClick={() => (setThreadId(null), setError(null))} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        {!online ? (
          <p role="status" className="t-label mb-3 rounded-[12px] bg-surface p-3 text-ink-2" data-testid="offline-banner">{AI_MESSAGES.OFFLINE}</p>
        ) : null}

        <GeneratePanel deps={deps} online={online} weekNumberFor={async () => weekFor(await allWeeks(), today)?.weekNumber} onSaved={(id) => nav(`/learn/pack/${id}`)} />

        <ul className="mt-4 flex flex-col gap-3" aria-label="Messages">
          {(messages ?? []).map((m) => (
            <li key={m.id} className={cn('max-w-[92%] rounded-[16px] px-4 py-3', m.role === 'user' ? 'self-end bg-raised' : 'self-start bg-surface')} data-role={m.role}>
              {m.role === 'user' ? <p className="t-body whitespace-pre-wrap">{m.content}</p> : <Prose text={m.content} className="t-body" />}
            </li>
          ))}
          {busy ? <li className="t-label self-start rounded-[16px] bg-surface px-4 py-3 text-ink-2" role="status">Thinking…</li> : null}
        </ul>
        {error ? (
          <p role="alert" className="t-label mt-3 rounded-[12px] border border-warning/50 p-3 text-warning" data-testid="ai-error" data-reason={error}>{AI_MESSAGES[error]}</p>
        ) : null}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2 px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <TextArea
          aria-label="Your question"
          placeholder={online ? 'Ask a question…' : 'Offline — chat needs a connection'}
          value={text}
          rows={1}
          disabled={!online}
          className="!min-h-12 max-h-32"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Button type="submit" disabled={!online || busy || !text.trim()} aria-label="Send" className="!size-12 shrink-0 !px-0">
          <Icon name="send" size={18} />
        </Button>
      </form>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Chat history">
        {threads && threads.length === 0 ? <Note>No chats yet.</Note> : null}
        <ul className="flex flex-col gap-2">
          {threads?.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-[12px] bg-surface p-3">
              <button type="button" className="press t-body min-w-0 flex-1 truncate text-left" onClick={() => (setThreadId(t.id), setHistoryOpen(false))}>{t.title}</button>
              <Pill tone="outline">{t.contextType.toLowerCase()}</Pill>
              <IconButton icon="trash" label={`Delete chat ${t.title}`} size={16} className="!size-9" onClick={() => void removeThread(t.id).then(() => threadId === t.id && setThreadId(null))} />
            </li>
          ))}
        </ul>
        <Link to="/learn" className="t-label mt-4 inline-block underline">Back to Learn</Link>
      </Sheet>
    </div>
  )
}

function GeneratePanel({ deps, online, weekNumberFor, onSaved }: { deps?: AiDeps; online: boolean; weekNumberFor: () => Promise<number | undefined>; onSaved: (packId: string) => void }) {
  const [topic, setTopic] = useState('')
  const [track, setTrack] = useState<Track | null>(null)
  const [count, setCount] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ reason: AiFailure; detail?: string } | null>(null)

  async function generate() {
    if (!topic.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await generatePack({ topic, track: track ?? 'GENERAL', cardCount: count }, deps)
      if (!r.ok) return setError({ reason: r.reason, detail: r.detail })
      // r.data is ALREADY validated (same validator as the seeded packs). Only now is anything written.
      const saved = await savePack(r.data, {
        topic: topic.trim(),
        track: track ?? undefined,
        weekNumber: await weekNumberFor(),
        tags: topic.toLowerCase().split(/[^a-z0-9+#/]+/).filter((w) => w.length > 2).slice(0, 6),
        source: 'AI_GENERATED',
      })
      onSaved(saved.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Collapsible title="Generate a pack from a topic" right={<Pill tone="outline">AI</Pill>}>
      <div className="flex flex-col gap-3">
        <TextField aria-label="Pack topic" placeholder="e.g. Union-Find with path compression" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void generate())} />
        <ChipGroup label="Track" options={TRACKS} value={track} onChange={setTrack} render={(t) => TRACK_LABEL[t]} />
        <div className="flex items-center justify-between">
          <span className="t-label">Cards</span>
          <Stepper label="Cards" value={count} onChange={setCount} min={6} max={10} />
        </div>
        <Button onClick={() => void generate()} disabled={!online || busy || !topic.trim()} icon="sparkle">{busy ? 'Writing…' : 'Generate'}</Button>
        <Note>Only the topic, track and card count are sent. A pack always ends: 6–10 cards, then a summary.</Note>
        {error ? <p role="alert" className="t-label text-warning" data-testid="gen-error" data-reason={error.reason}>{AI_MESSAGES[error.reason]}</p> : null}
      </div>
    </Collapsible>
  )
}

