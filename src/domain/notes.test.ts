import { describe, expect, it } from 'vitest'
import { linkLabel, nextBlockType, noteText, searchNotes, terms } from './notes'
import type { NoteBlockRow, NoteRow } from '@/data/types'

const base = { createdAt: '', updatedAt: '2026-01-01', deletedAt: null, syncedAt: null }
const note = (id: string, title: string, updatedAt = '2026-01-01', extra: Partial<NoteRow> = {}): NoteRow => ({ ...base, id, title, linkType: 'NONE', updatedAt, ...extra })
const block = (noteId: string, text: string, orderIndex: number, extra: Partial<NoteBlockRow> = {}): NoteBlockRow => ({ ...base, id: `${noteId}-${orderIndex}`, noteId, type: 'PARAGRAPH', text, orderIndex, ...extra })

const notes = [note('a', 'B+ tree notes'), note('b', 'Interview prep', '2026-02-01'), note('c', 'Café ideas', '2026-03-01')]
const blocks = [block('a', 'Leaves are linked for range scans.', 0), block('a', 'Fanout is hundreds.', 1), block('b', 'Practise the B+ tree question and system design.', 0), block('c', 'Résumé tips', 0)]

describe('notes search', () => {
  it('splits and normalises terms', () => expect(terms('  Foo   BAR ')).toEqual(['foo', 'bar']))
  it('empty query lists notes newest first', () => {
    expect(searchNotes(notes, blocks, '').map((h) => h.note.id)).toEqual(['c', 'b', 'a'])
  })
  it('title hits outrank body hits', () => {
    expect(searchNotes(notes, blocks, 'b+ tree').map((h) => h.note.id)).toEqual(['a', 'b'])
  })
  it('every term must match somewhere in the note (AND), across title and blocks', () => {
    expect(searchNotes(notes, blocks, 'tree fanout').map((h) => h.note.id)).toEqual(['a'])
    expect(searchNotes(notes, blocks, 'tree banana')).toEqual([])
  })
  it('is case- and accent-insensitive', () => {
    expect(searchNotes(notes, blocks, 'CAFE').map((h) => h.note.id)).toEqual(['c'])
    expect(searchNotes(notes, blocks, 'resume').map((h) => h.note.id)).toEqual(['c'])
  })
  it('snippets surround the first body match with ellipses when trimmed', () => {
    const long = [block('a', 'x'.repeat(80) + ' NEEDLE ' + 'y'.repeat(80), 0)]
    const [hit] = searchNotes([note('a', 'T')], long, 'needle')
    expect(hit!.snippet).toMatch(/^….*NEEDLE.*…$/)
    expect(searchNotes(notes, blocks, 'range')[0]!.snippet).toContain('range scans')
  })
  it('ignores deleted notes and blocks', () => {
    expect(searchNotes([{ ...notes[0]!, deletedAt: 'x' }], blocks, 'tree')).toEqual([])
    expect(searchNotes([notes[0]!], [{ ...blocks[0]!, deletedAt: 'x' }, blocks[1]!], 'range')).toEqual([])
  })
  it('noteText joins blocks in order', () => {
    expect(noteText([block('a', 'two', 1), block('a', 'one', 0), block('a', '', 2)])).toBe('one\ntwo')
  })
})

describe('links & blocks', () => {
  it('labels links', () => {
    expect(linkLabel({ linkType: 'NONE' })).toBeNull()
    expect(linkLabel({ linkType: 'WEEK', linkId: '4' })).toBe('Week 4')
    expect(linkLabel({ linkType: 'DAY', linkId: '2026-08-03' })).toBe('2026-08-03')
    expect(linkLabel({ linkType: 'EVENT', linkId: 'e' }, { event: () => 'Mock interview' })).toBe('Mock interview')
    expect(linkLabel({ linkType: 'APPLICATION', linkId: 'x' })).toBe('Application')
  })
  it('Enter keeps list kinds, otherwise starts a paragraph', () => {
    expect(['TODO', 'BULLET', 'PARAGRAPH', 'HEADING', 'CODE', 'QUOTE'].map((t) => nextBlockType(t as never))).toEqual(['TODO', 'BULLET', 'PARAGRAPH', 'PARAGRAPH', 'PARAGRAPH', 'PARAGRAPH'])
  })
})
