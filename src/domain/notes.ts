import type { NoteBlockRow, NoteRow } from '@/data/types'

/**
 * Full-text search over note titles and block text. Pure and in-memory (a personal notebook is small): every
 * whitespace-separated term must match somewhere in the note (AND); title hits outrank body hits; results carry a
 * snippet around the first body match.
 */
export interface NoteHit {
  note: NoteRow
  score: number
  snippet: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
export const terms = (q: string): string[] => norm(q).split(/\s+/).filter(Boolean)

export function noteText(blocks: NoteBlockRow[]): string {
  return [...blocks].sort((a, b) => a.orderIndex - b.orderIndex).map((b) => b.text).filter(Boolean).join('\n')
}

function snippetAround(body: string, term: string, radius = 48): string {
  const i = norm(body).indexOf(term)
  if (i < 0) return body.slice(0, radius * 2).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, i - radius)
  const end = Math.min(body.length, i + term.length + radius)
  return `${start > 0 ? '…' : ''}${body.slice(start, end).replace(/\s+/g, ' ').trim()}${end < body.length ? '…' : ''}`
}

export function searchNotes(notes: NoteRow[], blocks: NoteBlockRow[], query: string): NoteHit[] {
  const ts = terms(query)
  const byNote = new Map<string, NoteBlockRow[]>()
  for (const b of blocks) if (!b.deletedAt) byNote.set(b.noteId, [...(byNote.get(b.noteId) ?? []), b])
  const live = notes.filter((n) => !n.deletedAt)

  if (ts.length === 0) {
    return [...live].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((note) => ({ note, score: 0, snippet: noteText(byNote.get(note.id) ?? []).slice(0, 96).replace(/\s+/g, ' ') }))
  }
  const hits: NoteHit[] = []
  for (const note of live) {
    const title = norm(note.title)
    const body = noteText(byNote.get(note.id) ?? [])
    const nb = norm(body)
    let score = 0
    let all = true
    for (const t of ts) {
      const inTitle = title.includes(t)
      const inBody = nb.includes(t)
      if (!inTitle && !inBody) {
        all = false
        break
      }
      score += (inTitle ? 10 : 0) + (inBody ? 1 : 0)
    }
    if (!all) continue
    const firstBody = ts.find((t) => nb.includes(t))
    hits.push({ note, score, snippet: firstBody ? snippetAround(body, firstBody) : body.slice(0, 96).replace(/\s+/g, ' ') })
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
}

export function linkLabel(n: Pick<NoteRow, 'linkType' | 'linkId'>, resolve: { event?: (id: string) => string | undefined; application?: (id: string) => string | undefined } = {}): string | null {
  switch (n.linkType) {
    case 'NONE': return null
    case 'WEEK': return n.linkId ? `Week ${n.linkId}` : null
    case 'DAY': return n.linkId ?? null
    case 'EVENT': return (n.linkId && resolve.event?.(n.linkId)) || 'Event'
    case 'APPLICATION': return (n.linkId && resolve.application?.(n.linkId)) || 'Application'
  }
}

/** Type a bullet/todo block's Enter → another block of the same kind; anything else → a plain paragraph. */
export function nextBlockType(t: NoteBlockRow['type']): NoteBlockRow['type'] {
  return t === 'TODO' || t === 'BULLET' ? t : 'PARAGRAPH'
}
