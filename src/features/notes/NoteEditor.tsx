import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addBlock, getNote, removeBlock, removeNote, updateBlock, updateNote } from '@/data/repos/notes'
import { allApplications } from '@/data/repos/applications'
import { listEvents } from '@/data/repos/events'
import { nextBlockType } from '@/domain/notes'
import { newId } from '@/lib/ids'
import { NOTE_BLOCK_TYPES, NOTE_LINK_TYPES, type NoteBlockType, type NoteLinkType } from '@/lib/enums'
import type { NoteBlockRow } from '@/data/types'
import { Button, Chip, IconButton, Note } from '@/ui/primitives'
import { Checkbox, ChipGroup, TextField } from '@/ui/controls'
import { Sheet } from '@/ui/Sheet'
import { Icon } from '@/ui/Icon'
import { cn } from '@/lib/cn'
import { useToday } from '@/features/useToday'

const TYPE_LABEL: Record<NoteBlockType, string> = { PARAGRAPH: 'Text', HEADING: 'Heading', TODO: 'To-do', BULLET: 'Bullet', CODE: 'Code', QUOTE: 'Quote' }
const LINK_LABEL: Record<NoteLinkType, string> = { NONE: 'None', WEEK: 'Week', EVENT: 'Event', APPLICATION: 'Application', DAY: 'Day' }

/** A block editor: blocks + linking, nothing more. Enter makes the next block, Backspace on an empty one removes it. */
export function NoteEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const doc = useLiveQuery(async () => (await getNote(id)) ?? null, [id])
  const focusId = useRef<string | null>(null)
  const refs = useRef(new Map<string, HTMLTextAreaElement | null>())
  const ready = useRef(new Map<string, Promise<void>>())
  const [optimistic, setOptimistic] = useState<NoteBlockRow[]>([])
  const [linkOpen, setLinkOpen] = useState(false)

  useEffect(() => {
    if (!focusId.current) return
    const el = refs.current.get(focusId.current)
    if (el) {
      el.focus()
      focusId.current = null
    }
  })

  const stored = doc?.blocks
  const blocks = useMemo(() => {
    const have = new Set((stored ?? []).map((x) => x.id))
    return [...(stored ?? []), ...optimistic.filter((o) => !have.has(o.id))].sort((a, b) => a.orderIndex - b.orderIndex)
  }, [stored, optimistic])
  // Once the database has caught up, the optimistic copy is redundant.
  useEffect(() => {
    if (stored && optimistic.some((o) => stored.some((x) => x.id === o.id))) setOptimistic((cur) => cur.filter((o) => !stored.some((x) => x.id === o.id)))
  }, [stored, optimistic])

  if (doc === undefined) return <div className="p-5" />
  if (doc === null || !doc.note) {
    return (
      <div className="mx-auto max-w-[520px] p-5">
        <h1 className="t-title">Note not found</h1>
        <Link to="/notes" className="t-label mt-3 inline-block underline">Back to notes</Link>
      </div>
    )
  }
  const { note } = doc

  /**
   * Insert after `b` OPTIMISTICALLY: a client-generated id, a fractional orderIndex between the neighbours (so
   * nothing else has to be renumbered), rendered and focused immediately — keystrokes typed right after Enter
   * land in the NEW block, not the old one. The database write follows.
   */
  function addAfter(b: NoteBlockRow | null, type: NoteBlockType) {
    const idx = b ? blocks.findIndex((x) => x.id === b.id) : blocks.length - 1
    const prev = blocks[idx]
    const next = blocks[idx + 1]
    const orderIndex = prev ? (next ? (prev.orderIndex + next.orderIndex) / 2 : prev.orderIndex + 1) : 0
    const id = newId()
    const fields = { noteId: note!.id, type, text: '', orderIndex, checked: type === 'TODO' ? false : undefined }
    const now = new Date(0).toISOString()
    setOptimistic((cur) => [...cur, { id, createdAt: now, updatedAt: now, deletedAt: null, syncedAt: null, ...fields }])
    focusId.current = id
    ready.current.set(id, addBlock(fields, id).then(() => undefined))
  }
  async function move(b: NoteBlockRow, dir: -1 | 1) {
    const idx = blocks.findIndex((x) => x.id === b.id)
    const other = blocks[idx + dir]
    if (!other) return
    await updateBlock(b.id, { orderIndex: other.orderIndex })
    await updateBlock(other.id, { orderIndex: b.orderIndex })
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[520px] px-5 pt-[max(16px,env(safe-area-inset-top))] pb-24">
      <header className="mb-4 flex items-center gap-2">
        <IconButton icon="chevron-left" label="Back to notes" onClick={() => nav('/notes')} className="-ml-3" />
        <div className="flex-1" />
        <Chip onClick={() => setLinkOpen(true)} data-testid="link-chip">
          <Icon name="link" size={14} />&nbsp;{note.linkType === 'NONE' ? 'Link to…' : `Linked: ${LINK_LABEL[note.linkType]}`}
        </Chip>
        <IconButton icon="trash" label="Delete note" onClick={async () => (await removeNote(note.id), nav('/notes'))} />
      </header>

      <input
        aria-label="Title"
        className="t-display mb-4 w-full bg-transparent outline-none placeholder:text-ink-3"
        placeholder="Untitled"
        defaultValue={note.title}
        key={note.id}
        onBlur={(e) => e.target.value !== note.title && void updateNote(note.id, { title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
            const first = blocks[0]
            if (first) refs.current.get(first.id)?.focus()
          }
        }}
      />

      <ul className="flex flex-col gap-1" aria-label="Blocks">
        {blocks.map((b, i) => (
          <BlockRow
            key={b.id}
            b={b}
            first={i === 0}
            last={i === blocks.length - 1}
            setRef={(el) => refs.current.set(b.id, el)}
            onEnter={() => addAfter(b, nextBlockType(b.type))}
            ready={ready.current.get(b.id)}
            onBackspaceEmpty={async () => {
              if (blocks.length === 1) return
              const prev = blocks[i - 1] ?? blocks[i + 1]
              await removeBlock(b.id)
              if (prev) refs.current.get(prev.id)?.focus()
            }}
            onMove={(d) => move(b, d)}
          />
        ))}
      </ul>
      <Button variant="ghost" icon="plus" className="mt-3" onClick={() => addAfter(blocks.at(-1) ?? null, 'PARAGRAPH')}>
        Add block
      </Button>

      <LinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} noteId={note.id} linkType={note.linkType} linkId={note.linkId} />
    </div>
  )
}

function BlockRow({ b, first, last, setRef, onEnter, onBackspaceEmpty, onMove, ready }: { b: NoteBlockRow; first: boolean; last: boolean; setRef: (el: HTMLTextAreaElement | null) => void; onEnter: () => void; onBackspaceEmpty: () => void; onMove: (d: -1 | 1) => void; ready?: Promise<void> }) {
  const [text, setText] = useState(b.text)
  const [focused, setFocused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(text)
  latest.current = text
  const saved = useRef(b.text)

  useEffect(() => {
    if (!focused && b.text !== latest.current) {
      setText(b.text)
      saved.current = b.text
    }
  }, [b.text, focused])
  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (latest.current !== saved.current) {
      saved.current = latest.current
      const text = latest.current
      // an optimistically-inserted block may not be in the database yet: wait for its insert
      void (ready ?? Promise.resolve()).then(() => updateBlock(b.id, { text }))
    }
  }
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const cls = cn(
    'w-full resize-none bg-transparent outline-none placeholder:text-ink-3',
    b.type === 'HEADING' && 't-heading',
    b.type === 'CODE' && 'rounded-[10px] bg-surface p-3 font-mono text-[13px]',
    b.type === 'QUOTE' && 't-reader border-l-2 border-hairline pl-3 italic',
    (b.type === 'PARAGRAPH' || b.type === 'TODO' || b.type === 'BULLET') && 't-body',
    b.type === 'TODO' && b.checked && 'text-ink-2 line-through',
  )
  return (
    <li className="group flex items-start gap-2 py-0.5" data-testid="block" data-type={b.type}>
      <span className="mt-1 flex w-6 shrink-0 justify-center">
        {b.type === 'TODO' ? <Checkbox label="Done" checked={!!b.checked} onChange={(v) => void updateBlock(b.id, { checked: v })} className="!-m-3 scale-[0.75]" /> : null}
        {b.type === 'BULLET' ? <span className="mt-2 size-1.5 rounded-full bg-ink-2" aria-hidden /> : null}
      </span>
      <textarea
        ref={(el) => {
          setRef(el)
          if (el) {
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }
        }}
        aria-label={`${TYPE_LABEL[b.type]} block`}
        className={cls}
        rows={1}
        value={text}
        placeholder={b.type === 'PARAGRAPH' ? 'Write something…' : TYPE_LABEL[b.type]}
        onFocus={() => setFocused(true)}
        onBlur={() => (setFocused(false), flush())}
        onChange={(e) => {
          setText(e.target.value)
          latest.current = e.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(flush, 400)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && b.type !== 'CODE') {
            e.preventDefault()
            flush()
            // Enter on an EMPTY list item ends the list: it becomes a paragraph instead of making another.
            if ((b.type === 'TODO' || b.type === 'BULLET') && !latest.current.trim()) void (ready ?? Promise.resolve()).then(() => updateBlock(b.id, { type: 'PARAGRAPH', checked: undefined }))
            else onEnter()
          } else if (e.key === 'Backspace' && latest.current === '' && !first) {
            e.preventDefault()
            onBackspaceEmpty()
          }
        }}
      />
      {focused ? (
        <span className="flex shrink-0 gap-0.5" onMouseDown={(e) => e.preventDefault()}>
          <select aria-label="Block type" className="t-meta rounded-[8px] bg-surface px-1.5 py-1 text-ink-2" value={b.type} onChange={(e) => void updateBlock(b.id, { type: e.target.value as NoteBlockType, checked: e.target.value === 'TODO' ? (b.checked ?? false) : undefined })}>
            {NOTE_BLOCK_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <IconButton icon="chevron-up" label="Move up" size={14} className="!size-8" disabled={first} onClick={() => onMove(-1)} />
          <IconButton icon="chevron-down" label="Move down" size={14} className="!size-8" disabled={last} onClick={() => onMove(1)} />
        </span>
      ) : null}
    </li>
  )
}

function LinkSheet({ open, onClose, noteId, linkType, linkId }: { open: boolean; onClose: () => void; noteId: string; linkType: NoteLinkType; linkId?: string }) {
  const today = useToday()
  const events = useLiveQuery(listEvents, [], [])
  const apps = useLiveQuery(allApplications, [], [])
  const [type, setType] = useState<NoteLinkType>(linkType)
  useEffect(() => setType(linkType), [linkType, open])
  const set = async (t: NoteLinkType, id?: string) => {
    await updateNote(noteId, { linkType: t, linkId: id })
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Link this note" testId="link-sheet">
      <div className="flex flex-col gap-4">
        <ChipGroup label="Link type" options={NOTE_LINK_TYPES} value={type} onChange={(t) => (t === 'NONE' ? void set('NONE') : setType(t))} render={(t) => LINK_LABEL[t]} />
        {type === 'WEEK' ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Week">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => <Chip key={n} selected={linkType === 'WEEK' && linkId === String(n)} onClick={() => void set('WEEK', String(n))}>W{n}</Chip>)}
          </div>
        ) : null}
        {type === 'DAY' ? <TextField type="date" aria-label="Day" defaultValue={linkType === 'DAY' ? linkId : today} onChange={(e) => e.target.value && void set('DAY', e.target.value)} /> : null}
        {type === 'APPLICATION' ? (
          apps.length ? <ul className="flex flex-col gap-1.5">{apps.map((a) => <li key={a.id}><Chip selected={linkId === a.id} onClick={() => void set('APPLICATION', a.id)}>{a.company} — {a.role}</Chip></li>)}</ul> : <Note>No applications yet.</Note>
        ) : null}
        {type === 'EVENT' ? (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {events.filter((e) => e.type !== 'STUDY_BLOCK').sort((a, b) => a.date.localeCompare(b.date)).map((e) => <li key={e.id}><Chip selected={linkId === e.id} onClick={() => void set('EVENT', e.id)}>{e.date.slice(5)} · {e.title}</Chip></li>)}
          </ul>
        ) : null}
      </div>
    </Sheet>
  )
}
