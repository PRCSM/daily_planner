import { db } from '../db'
import { alive, makeRow, patchRow, putRow, runTx, softDelete } from '../rows'
import type { NoteLinkType } from '@/lib/enums'
import type { NoteBlockRow, NoteRow } from '../types'

export async function allNotes(): Promise<NoteRow[]> {
  return alive(await db.notes.orderBy('updatedAt').reverse().toArray())
}
export async function allNoteBlocks(): Promise<NoteBlockRow[]> {
  return alive(await db.noteBlocks.toArray())
}
export async function getNote(id: string): Promise<{ note?: NoteRow; blocks: NoteBlockRow[] }> {
  return db.transaction('r', db.notes, db.noteBlocks, async () => {
    const n = await db.notes.get(id)
    const note = n && !n.deletedAt ? n : undefined
    const blocks = note ? alive(await db.noteBlocks.where('noteId').equals(id).toArray()).sort((a, b) => a.orderIndex - b.orderIndex) : []
    return { note, blocks }
  })
}
export async function notesLinkedTo(linkType: NoteLinkType, linkId: string): Promise<NoteRow[]> {
  return alive(await db.notes.where('linkType').equals(linkType).toArray()).filter((n) => n.linkId === linkId)
}
export async function createNote(title: string, linkType: NoteLinkType = 'NONE', linkId?: string): Promise<NoteRow> {
  return runTx(['notes', 'noteBlocks'], async () => {
    const note = await putRow('notes', makeRow<NoteRow>({ title, linkType, linkId }))
    await putRow('noteBlocks', makeRow<NoteBlockRow>({ noteId: note.id, type: 'PARAGRAPH', text: '', orderIndex: 0 }))
    return note
  })
}
export const updateNote = (id: string, patch: Partial<NoteRow>) => patchRow('notes', id, patch)
export const removeNote = (id: string) => softDelete('notes', id)
/** `id` may be supplied so an editor can render the block optimistically before the write lands. */
export const addBlock = (fields: Omit<NoteBlockRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt'>, id?: string) => putRow('noteBlocks', makeRow<NoteBlockRow>(fields, id))
export const updateBlock = async (id: string, patch: Partial<NoteBlockRow>) => {
  const b = await patchRow('noteBlocks', id, patch)
  await patchRow('notes', b.noteId, {}) // touch parent so it sorts to the top
  return b
}
export const removeBlock = (id: string) => softDelete('noteBlocks', id)
