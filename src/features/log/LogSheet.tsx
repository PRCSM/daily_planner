import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getLogSheetBundle } from '@/data/repos/bundles'
import { Sheet } from '@/ui/Sheet'
import { Button, Chip, IconButton, Note, Pill } from '@/ui/primitives'
import { ChipGroup, Stepper, TextField, Toggle } from '@/ui/controls'
import { Icon } from '@/ui/Icon'
import { Collapsible, LiveText, Rail, useOptimistic } from '@/features/common/bits'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { addLogBlock, addDsaProblem, deleteLogBlock, editLogBlock, patchDay, setFuel } from '@/features/services/logging'
import { addDays, formatDay, formatDuration, relativeDay } from '@/domain/dates'
import { fuelDefaults, orderTracks, topicSuggestions } from '@/domain/log'
import { isAiViolation, isLearning } from '@/domain/aiOff'
import { weekFor } from '@/domain/weeks'
import { DIFFICULTIES, DSA_PATTERNS, DSA_STATUSES, DSA_STATUS_LABEL, TRACKS, TRACK_LABEL, type Difficulty, type DsaStatus, type Track } from '@/lib/enums'
import { cn } from '@/lib/cn'

const PRESETS = [30, 60, 90] as const

/**
 * THE most important screen. A bottom sheet, PRE-MOUNTED in the shell so it opens in <200ms.
 * Flow: track chip (last-used first) → minute preset → topic (+Enter re-focuses for the next block).
 * Every change autosaves; swipe the date to backfill.
 */
export function LogSheet() {
  const { open, date: logDate, prefill } = useUi((s) => s.log)
  const closeLog = useUi((s) => s.closeLog)
  const setLogDate = useUi((s) => s.setLogDate)
  const today = useToday()
  const date = logDate ?? today
  const bundle = useLiveQuery(() => getLogSheetBundle(date), [date])

  // ── the block being composed ──
  const [track, setTrack] = useState<Track | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [topic, setTopic] = useState('')
  const [ai, setAi] = useState<boolean | null>(null)
  const topicRef = useRef<HTMLInputElement>(null)

  const ordered = useMemo(() => orderTracks(TRACKS, bundle?.recentTracks ?? []), [bundle?.recentTracks])
  const effTrack: Track = track ?? ordered[0] ?? 'DSA'
  const lastMinutes = bundle?.lastBlock?.minutes
  const effMinutes = minutes ?? (lastMinutes && lastMinutes > 0 ? lastMinutes : 60)
  // AI defaults: OFF for learning tracks, ON for shipping tracks. The user can flip it per block.
  const effAi = ai ?? !isLearning({ track: effTrack })

  // Opening with a prefill (e.g. ticking a planner task) seeds the composer; it never writes anything itself.
  useEffect(() => {
    if (!open || !prefill) return
    if (prefill.track) setTrack(prefill.track)
    if (prefill.minutes) setMinutes(prefill.minutes)
    if (prefill.topic !== undefined) setTopic(prefill.topic)
    setAi(null)
  }, [open, prefill])

  const week = bundle ? weekFor(bundle.weeks, date) : undefined
  const suggestions = useMemo(() => topicSuggestions(bundle?.recentTopics ?? [], topic, effTrack), [bundle?.recentTopics, topic, effTrack])
  const totalMinutes = (bundle?.blocks ?? []).reduce((n, b) => n + b.minutes, 0)

  async function commit() {
    if (!(effMinutes > 0)) return
    await addLogBlock({ date, track: effTrack, minutes: effMinutes, topic, aiUsed: effAi })
    setTopic('')
    setAi(null)
    topicRef.current?.focus() // Enter → ready for the next block
  }

  // ── date: prev / next / swipe ──
  const shift = (n: number) => {
    const next = addDays(date, n)
    if (next <= today) setLogDate(next)
  }
  const swipe = useRef<number | null>(null)

  const prevFuel = bundle?.prevFuel
  const ghost = fuelDefaults(prevFuel)
  const fuelEntered = bundle?.log?.fuelEntered === true
  const [sleep, setSleep] = useOptimistic(bundle?.log?.sleepHours ?? ghost.sleepHours)
  const [apps, setApps] = useOptimistic(bundle?.log?.applicationsSent ?? 0)
  const trained = bundle?.log ? (fuelEntered ? bundle.log.trained : ghost.trained) : ghost.trained
  const energy = fuelEntered ? (bundle?.log?.energy ?? ghost.energy) : ghost.energy

  return (
    <Sheet open={open} onClose={closeLog} title="Log" tall testId="log-sheet">
      {/* Date — swipe to backfill */}
      <div
        className="mb-4 flex touch-pan-y items-center justify-between rounded-[14px] bg-surface p-1"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return
          const dx = e.clientX - swipe.current
          swipe.current = null
          if (dx > 48) shift(-1)
          else if (dx < -48) shift(1)
        }}
        data-testid="log-date"
      >
        <IconButton icon="chevron-left" label="Previous day" onClick={() => shift(-1)} />
        <button type="button" className="press min-w-0 flex-1 px-2 text-center" onClick={() => setLogDate(today)} aria-label="Jump to today">
          <div className="t-body-strong">{formatDay(date)}</div>
          <div className="t-meta text-ink-2">
            {relativeDay(date, today)}
            {week ? ` · week ${week.weekNumber}` : ''}
            {totalMinutes ? ` · ${formatDuration(totalMinutes)} logged` : ''}
          </div>
        </button>
        <IconButton icon="chevron-right" label="Next day" onClick={() => shift(1)} disabled={date >= today} className="disabled:opacity-30" />
      </div>

      {/* Track → minutes → topic */}
      <Rail label="Track">
        {ordered.map((t) => (
          <Chip
            key={t}
            selected={effTrack === t}
            onClick={() => {
              setTrack(t)
              setAi(null)
            }}
          >
            {TRACK_LABEL[t]}
          </Chip>
        ))}
      </Rail>

      <div className="mt-3 flex items-center gap-2">
        {PRESETS.map((m) => (
          <Chip key={m} selected={effMinutes === m && !custom} onClick={() => (setMinutes(m), setCustom(''))}>
            {m}m
          </Chip>
        ))}
        <TextField
          aria-label="Custom minutes"
          inputMode="numeric"
          placeholder="min"
          value={custom}
          className="!w-20 !py-2 text-center"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 3)
            setCustom(v)
            if (v) setMinutes(Number(v))
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="t-label whitespace-nowrap text-ink-2">AI used</span>
          <Toggle label="AI used" checked={effAi} onChange={setAi} />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <TextField
          ref={topicRef}
          aria-label="Topic"
          placeholder="topic — then Enter"
          value={topic}
          enterKeyHint="done"
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && topic.trim()) {
              e.preventDefault()
              void commit()
            }
          }}
        />
        <Button onClick={() => void commit()} aria-label="Add block" icon="plus" className="shrink-0 !px-4">
          Add
        </Button>
      </div>
      {suggestions.length > 0 ? (
        <div className="mt-2">
          <Rail label="Topic suggestions">
            {suggestions.map((s) => (
              <Chip key={s} onClick={() => setTopic(s)}>
                {s}
              </Chip>
            ))}
          </Rail>
        </div>
      ) : null}
      {effAi && isLearning({ track: effTrack }) ? <Note className="mt-2 text-warning">AI is meant to be off for {TRACK_LABEL[effTrack]} — it will be flagged, not judged.</Note> : null}

      {/* Today's blocks */}
      {bundle && bundle.blocks.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2" aria-label="Logged blocks">
          {bundle.blocks.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-[14px] bg-surface p-3.5" data-testid="logged-block">
              <span className="t-body min-w-0 flex-1">
                <span className="t-body-strong">{TRACK_LABEL[b.track]}:</span> {b.topic ?? <span className="text-ink-3">no topic</span>}
              </span>
              <button
                type="button"
                aria-label={b.aiUsed ? 'AI used — tap to clear' : 'AI-free — tap to mark AI used'}
                className="press"
                onClick={() => void editLogBlock(b.id, { aiUsed: !b.aiUsed })}
              >
                {b.aiUsed ? <Pill tone={isAiViolation(b) ? 'warning' : 'outline'}>AI</Pill> : isLearning(b) ? <Pill tone="outline">AI-free</Pill> : null}
              </button>
              <Pill>{formatDuration(b.minutes)}</Pill>
              <IconButton icon="trash" label="Delete block" size={16} className="!size-9" onClick={() => void deleteLogBlock(b.id)} />
            </li>
          ))}
        </ul>
      ) : null}

      {/* DSA quick-add */}
      <DsaQuickAdd date={date} open={effTrack === 'DSA'} weekTopics={week?.topics ?? []} problems={bundle?.problems ?? []} />

      {/* Applications stepper */}
      <div className="mt-4 flex items-center justify-between rounded-[14px] bg-surface p-4">
        <span className="t-body-strong">Applications sent</span>
        <Stepper label="Applications sent" value={apps} onChange={(v) => (setApps(v), void patchDay(date, { applicationsSent: v }))} min={0} max={50} />
      </div>

      {/* One-liners */}
      <div className="mt-4 flex flex-col gap-2">
        <LiveText key={`${date}-shipped`} label="Shipped" placeholder="Shipped today (one line)" value={bundle?.log?.shipped ?? ''} onSave={(v) => void patchDay(date, { shipped: v })} />
        <LiveText key={`${date}-blockers`} label="Blockers" placeholder="Blockers (one line)" value={bundle?.log?.blockers ?? ''} onSave={(v) => void patchDay(date, { blockers: v })} />
      </div>

      {/* Fuel — carries yesterday's values as GHOSTS; nothing is written until you touch it */}
      <div className="mt-4 rounded-[14px] bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="t-body-strong">Fuel</span>
          {!fuelEntered ? (
            prevFuel ? (
              <Chip onClick={() => void setFuel(date, { sleepHours: ghost.sleepHours, trained: ghost.trained, energy: ghost.energy })}>Same as yesterday</Chip>
            ) : (
              <span className="t-meta text-ink-2">not entered</span>
            )
          ) : (
            <span className="t-meta text-ink-2">saved</span>
          )}
        </div>
        <div className={cn('flex flex-col gap-3', !fuelEntered && 'opacity-60')}>
          <div className="flex items-center justify-between">
            <span className="t-label">Sleep</span>
            <Stepper label="Sleep hours" value={sleep} onChange={(v) => (setSleep(v), void setFuel(date, { sleepHours: v }))} min={0} max={14} step={0.5} format={(v) => `${v}h`} />
          </div>
          <div className="flex items-center justify-between">
            <span className="t-label">Trained</span>
            <Toggle label="Trained" checked={trained} onChange={(v) => void setFuel(date, { trained: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="t-label">Energy</span>
            <ChipGroup label="Energy" options={[1, 2, 3, 4, 5] as const} value={energy} onChange={(v) => void setFuel(date, { energy: v })} className="!flex-nowrap !gap-1.5" />
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function DsaQuickAdd({ date, open, weekTopics, problems }: { date: string; open: boolean; weekTopics: string[]; problems: { id: string; title: string; status: DsaStatus }[] }) {
  const [title, setTitle] = useState('')
  const defaultPattern = DSA_PATTERNS.find((p) => weekTopics.includes(p.toLowerCase())) ?? 'Arrays'
  const [pattern, setPattern] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM')
  const [status, setStatus] = useState<DsaStatus>('SOLVED_UNAIDED')
  const ref = useRef<HTMLInputElement>(null)

  async function add() {
    if (!title.trim()) return
    await addDsaProblem({ title, pattern: pattern ?? defaultPattern, difficulty, status, solvedDate: date })
    setTitle('')
    ref.current?.focus()
  }

  return (
    <Collapsible className="mt-4" title="DSA problem" defaultOpen={open} right={problems.length ? <Pill>{problems.length} today</Pill> : null}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <TextField
            ref={ref}
            aria-label="Problem title"
            placeholder="problem — then Enter"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
          />
          <Button onClick={() => void add()} className="shrink-0 !px-4" aria-label="Add problem" icon="plus">
            Add
          </Button>
        </div>
        <Rail label="Pattern">
          {[...DSA_PATTERNS].map((p) => (
            <Chip key={p} selected={(pattern ?? defaultPattern) === p} onClick={() => setPattern(p)}>
              {p}
            </Chip>
          ))}
        </Rail>
        <ChipGroup label="Difficulty" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} render={(d) => d[0] + d.slice(1).toLowerCase()} />
        <ChipGroup label="Outcome" options={DSA_STATUSES} value={status} onChange={setStatus} render={(s) => DSA_STATUS_LABEL[s]} />
        {problems.length ? (
          <ul className="flex flex-col gap-1.5" aria-label="Problems logged today">
            {problems.map((p) => (
              <li key={p.id} className="t-label flex items-center justify-between rounded-[10px] bg-raised px-3 py-2">
                <span className="truncate">{p.title}</span>
                <Icon name="check" size={14} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Collapsible>
  )
}
