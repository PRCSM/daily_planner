import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogSheet } from './LogSheet'
import { useUi } from '@/features/store'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'

freshDbPerTest()

beforeEach(async () => {
  useUi.setState({ log: { open: false, date: null, prefill: null }, selectedDate: null })
  await ensureSeeded()
})

async function openSheet() {
  render(<LogSheet />)
  useUi.getState().openLog()
  await screen.findByTestId('log-date')
}

describe('Log sheet — the 30-second flow', () => {
  it('is PRE-MOUNTED: present in the DOM (inert) before it is opened, so opening is only a transform', () => {
    render(<LogSheet />)
    const sheet = screen.getByTestId('log-sheet')
    expect(sheet).toHaveAttribute('data-open', 'false')
    expect(within(sheet).getByRole('dialog', { hidden: true })).toBeInTheDocument()
    useUi.getState().openLog()
  })

  it('type a topic + Enter logs a block (track + minutes pre-selected), clears the field and keeps focus for the next one', async () => {
    const u = userEvent.setup()
    await openSheet()
    const topic = screen.getByLabelText('Topic')
    await u.click(topic)
    await u.type(topic, 'two pointers{Enter}')
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    const block = (await db.logBlocks.toArray())[0]!
    expect(block).toMatchObject({ track: 'DSA', minutes: 60, topic: 'two pointers', date: T0, blockType: 'DEEP_A', aiUsed: false })
    expect(topic).toHaveValue('')
    expect(topic).toHaveFocus() // ready for the next block
    expect(await screen.findAllByTestId('logged-block')).toHaveLength(1)
  })

  it('chips drive the block: pick a track and a preset, AI defaults ON for shipping tracks', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.click(screen.getByRole('button', { name: 'Project' }))
    await u.click(screen.getByRole('button', { name: '90m' }))
    await u.type(screen.getByLabelText('Topic'), 'sync worker{Enter}')
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    expect((await db.logBlocks.toArray())[0]).toMatchObject({ track: 'PROJECT', minutes: 90, aiUsed: true })
  })

  it('the track chips are ordered LAST-USED first', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.click(screen.getByRole('button', { name: 'GenAI' }))
    await u.type(screen.getByLabelText('Topic'), 'rag{Enter}')
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    await waitFor(() => {
      const first = within(screen.getByRole('group', { name: 'Track' })).getAllByRole('button')[0]!
      expect(first).toHaveTextContent('GenAI')
    })
  })

  it('autocompletes topics from history as chips', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.type(screen.getByLabelText('Topic'), 'sliding window{Enter}')
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    await u.type(screen.getByLabelText('Topic'), 'sli')
    expect(await screen.findByRole('button', { name: 'sliding window' })).toBeInTheDocument()
  })

  it('an empty topic + Enter does NOT log by accident (use the Add button)', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.click(screen.getByLabelText('Topic'))
    await u.keyboard('{Enter}')
    expect(await db.logBlocks.count()).toBe(0)
    await u.click(screen.getByRole('button', { name: 'Add block' }))
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
  })

  it('backfill: stepping the date back logs against THAT date, and "next" stops at today', async () => {
    const u = userEvent.setup()
    await openSheet()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Previous day' }))
    await u.type(screen.getByLabelText('Topic'), 'yesterday work{Enter}')
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    expect((await db.logBlocks.toArray())[0]!.date).toBe(addDays(T0, -1))
    expect((await db.dailyLogs.toArray())[0]!.date).toBe(addDays(T0, -1))
  })

  it('AI used on a learning track is flagged (amber) — and writing a one-liner never fabricates fuel', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.click(screen.getByRole('switch', { name: 'AI used' }))
    await u.type(screen.getByLabelText('Topic'), 'cheated{Enter}')
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    expect((await db.dailyLogs.toArray())[0]!.aiOffRespected).toBe(false)
    await u.type(screen.getByLabelText('Shipped'), 'a thing')
    await u.tab()
    await waitFor(async () => expect((await db.dailyLogs.toArray())[0]!.shipped).toBe('a thing'))
    expect((await db.dailyLogs.toArray())[0]!.fuelEntered).toBeUndefined()
  })

  it('fuel shows yesterday as ghosts; "Same as yesterday" commits them in one tap', async () => {
    const u = userEvent.setup()
    const { ensureLog, patchLog } = await import('@/data/repos/logs')
    const y = await ensureLog(addDays(T0, -1), { weekNumber: 4, phase: 'GET_PRESENTABLE' })
    await patchLog(y.id, { sleepHours: 5.5, trained: true, energy: 2, fuelEntered: true })
    await openSheet()
    expect(await screen.findByText('5.5h')).toBeInTheDocument() // the ghost
    expect(await db.dailyLogs.where('date').equals(T0).count()).toBe(0) // nothing written yet
    await u.click(screen.getByRole('button', { name: 'Same as yesterday' }))
    await waitFor(async () => expect((await db.dailyLogs.where('date').equals(T0).first())?.fuelEntered).toBe(true))
    expect(await db.dailyLogs.where('date').equals(T0).first()).toMatchObject({ sleepHours: 5.5, trained: true, energy: 2 })
  })

  it('DSA quick-add: title + Enter stores the problem with an automatic review schedule', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.click(screen.getByRole('button', { name: 'Hint' }))
    await u.type(screen.getByLabelText('Problem title'), '3Sum{Enter}')
    await waitFor(async () => expect(await db.dsaProblems.count()).toBe(1))
    expect((await db.dsaProblems.toArray())[0]).toMatchObject({ title: '3Sum', status: 'SOLVED_WITH_HINT', solvedDate: T0, reviewDue: addDays(T0, 7) })
  })

  it('applications stepper writes immediately (autosave on every change)', async () => {
    const u = userEvent.setup()
    await openSheet()
    await u.click(screen.getByRole('button', { name: 'Applications sent: more' }))
    await u.click(screen.getByRole('button', { name: 'Applications sent: more' }))
    await waitFor(async () => expect((await db.dailyLogs.toArray())[0]?.applicationsSent).toBe(2))
  })

  it('opening with a prefill (a ticked planner task) only seeds the composer — nothing is written', async () => {
    render(<LogSheet />)
    useUi.getState().openLog(undefined, { track: 'SYSTEM_DESIGN', minutes: 90, topic: 'URL shortener' })
    expect(await screen.findByDisplayValue('URL shortener')).toBeInTheDocument()
    expect(await db.logBlocks.count()).toBe(0)
  })
})
