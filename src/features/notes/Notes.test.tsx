import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NotesScreen } from './NotesScreen'
import { NoteEditor } from './NoteEditor'
import { WeekScreen } from '@/features/plan/WeekScreen'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { createNote, getNote, updateBlock, updateNote } from '@/data/repos/notes'
import { freshDbPerTest } from '@/test/db'

freshDbPerTest()

const app = (url: string) => (
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/notes" element={<NotesScreen />} />
      <Route path="/notes/:id" element={<NoteEditor />} />
      <Route path="/plan/week/:n" element={<WeekScreen />} />
    </Routes>
  </MemoryRouter>
)
const blocksOf = async (noteId: string) => (await getNote(noteId)).blocks

describe('Notes list + full-text search', () => {
  async function seed() {
    const a = await createNote('B+ tree notes', 'WEEK', '4')
    await updateBlock((await blocksOf(a.id))[0]!.id, { text: 'Leaves are linked for range scans' })
    const b = await createNote('Interview prep')
    await updateBlock((await blocksOf(b.id))[0]!.id, { text: 'Practise the B+ tree question' })
    return { a, b }
  }
  it('lists notes newest first with link pills and snippets', async () => {
    await seed()
    render(app('/notes'))
    const rows = await screen.findAllByTestId('note-row')
    expect(rows).toHaveLength(2)
    expect(within(rows.find((r) => r.textContent!.includes('B+ tree notes'))!).getByText('Week 4')).toBeInTheDocument()
  })
  it('searches titles AND block text, title hits first; unmatched queries say so', async () => {
    const u = userEvent.setup()
    await seed()
    render(app('/notes'))
    await screen.findAllByTestId('note-row')
    await u.type(screen.getByLabelText('Search notes'), 'tree')
    await waitFor(() => expect(screen.getAllByTestId('note-row').map((r) => r.textContent)).toEqual([expect.stringContaining('B+ tree notes'), expect.stringContaining('Interview prep')]))
    await u.clear(screen.getByLabelText('Search notes'))
    await u.type(screen.getByLabelText('Search notes'), 'range scans')
    await waitFor(() => expect(screen.getAllByTestId('note-row')).toHaveLength(1))
    await u.clear(screen.getByLabelText('Search notes'))
    await u.type(screen.getByLabelText('Search notes'), 'zzzz')
    expect(await screen.findByText(/No notes match/)).toBeInTheDocument()
  })
})

describe('Block editor', () => {
  it('Enter makes the next block; typing autosaves; list items continue, and Enter on an EMPTY list item ends the list', async () => {
    const u = userEvent.setup()
    const n = await createNote('Plan')
    await updateBlock((await blocksOf(n.id))[0]!.id, { type: 'TODO', text: '', checked: false })
    render(app(`/notes/${n.id}`))
    const first = await screen.findByLabelText('To-do block')
    await u.click(first)
    await u.type(first, 'write tests{Enter}ship it{Enter}{Enter}')
    await waitFor(async () => {
      const b = await blocksOf(n.id)
      expect(b.map((x) => [x.type, x.text])).toEqual([['TODO', 'write tests'], ['TODO', 'ship it'], ['PARAGRAPH', '']])
    })
    const orders = (await blocksOf(n.id)).map((b) => b.orderIndex)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders) // strictly ordered
  })

  it('Enter inserts the new block IN PLACE (between blocks), not at the end', async () => {
    const u = userEvent.setup()
    const n = await createNote('Order')
    const [b0] = await blocksOf(n.id)
    await updateBlock(b0!.id, { text: 'first' })
    const { addBlock } = await import('@/data/repos/notes')
    await addBlock({ noteId: n.id, type: 'PARAGRAPH', text: 'last', orderIndex: 1 })
    render(app(`/notes/${n.id}`))
    const boxes = await screen.findAllByLabelText('Text block')
    await u.click(boxes[0]!)
    await u.keyboard('{End}{Enter}middle')
    await waitFor(async () => expect((await blocksOf(n.id)).map((b) => b.text)).toEqual(['first', 'middle', 'last']))
  })

  it('Backspace on an empty block removes it (never the last remaining one)', async () => {
    const u = userEvent.setup()
    const n = await createNote('x')
    const { addBlock } = await import('@/data/repos/notes')
    await addBlock({ noteId: n.id, type: 'PARAGRAPH', text: '', orderIndex: 1 })
    render(app(`/notes/${n.id}`))
    const boxes = await screen.findAllByLabelText('Text block')
    await u.click(boxes[1]!)
    await u.keyboard('{Backspace}')
    await waitFor(async () => expect(await blocksOf(n.id)).toHaveLength(1))
    await u.click((await screen.findAllByLabelText('Text block'))[0]!)
    await u.keyboard('{Backspace}')
    expect(await blocksOf(n.id)).toHaveLength(1)
  })

  it('edits the title, and tolerates a missing note', async () => {
    const u = userEvent.setup()
    const n = await createNote('')
    const { unmount } = render(app(`/notes/${n.id}`))
    const title = await screen.findByLabelText('Title')
    await u.type(title, 'Graphs cheat-sheet')
    await u.tab()
    await waitFor(async () => expect((await db.notes.get(n.id))!.title).toBe('Graphs cheat-sheet'))
    unmount()
    render(app('/notes/nope'))
    expect(await screen.findByText('Note not found')).toBeInTheDocument()
  })

  it('links a note to a week, which then shows on that week’s page', async () => {
    const u = userEvent.setup()
    await ensureSeeded()
    const n = await createNote('Week 6 thoughts')
    const { unmount } = render(app(`/notes/${n.id}`))
    await u.click(await screen.findByTestId('link-chip'))
    const sheet = await screen.findByTestId('link-sheet')
    await u.click(within(sheet).getByRole('button', { name: 'Week' }))
    await u.click(within(sheet).getByRole('button', { name: 'W6' }))
    await waitFor(async () => expect(await db.notes.get(n.id)).toMatchObject({ linkType: 'WEEK', linkId: '6' }))
    unmount()
    render(app('/plan/week/6'))
    expect(await screen.findByTestId('week-note')).toHaveTextContent('Week 6 thoughts')
  })

  it('"None" clears a link', async () => {
    const u = userEvent.setup()
    const n = await createNote('x', 'DAY', '2026-08-03')
    render(app(`/notes/${n.id}`))
    await u.click(await screen.findByTestId('link-chip'))
    await u.click(within(await screen.findByTestId('link-sheet')).getByRole('button', { name: 'None' }))
    await waitFor(async () => expect((await db.notes.get(n.id))!.linkType).toBe('NONE'))
    await updateNote(n.id, {})
  })
})
