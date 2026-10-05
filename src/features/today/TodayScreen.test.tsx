import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodayScreen } from './TodayScreen'
import { useUi } from '@/features/store'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { addDsaProblem } from '@/features/services/logging'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays, formatDay, startOfWeek } from '@/domain/dates'

// T0 is the Monday of plan week 4, inside the seeded plan.
freshDbPerTest()
beforeEach(async () => {
  useUi.setState({ selectedDate: null, log: { open: false, date: null, prefill: null } })
  await ensureSeeded()
})

describe('Today', () => {
  it('shows the lowercase title, week/phase, DSA x/363 derived from seeded targets, and the three study blocks by section', async () => {
    render(<TodayScreen />)
    expect(await screen.findByRole('heading', { name: 'today' })).toBeInTheDocument()
    expect(await screen.findByText(/Week 4 · Get presentable/)).toBeInTheDocument()
    expect(await screen.findByText('DSA 0/363')).toBeInTheDocument()
    const morning = await screen.findByRole('region', { name: 'Morning' })
    expect(within(morning).getByText(/Deep A/)).toBeInTheDocument()
    const evening = screen.getByRole('region', { name: 'Evening' })
    expect(within(evening).getByText(/Deep B/)).toBeInTheDocument()
    expect(within(evening).getByText(/Block C/)).toBeInTheDocument()
  })

  it('the review queue is ABSENT when nothing is due — no heading, no empty state', async () => {
    render(<TodayScreen />)
    await screen.findByText('DSA 0/363')
    expect(screen.queryByTestId('review-queue')).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing due/i)).not.toBeInTheDocument()
  })

  it('an overdue review appears prominently (danger) and resolves with one tap', async () => {
    const u = userEvent.setup()
    await addDsaProblem({ title: 'LRU Cache', pattern: 'Hashing', difficulty: 'HARD', status: 'SOLVED_WITH_HINT', solvedDate: addDays(T0, -10) }) // due 3 days ago
    render(<TodayScreen />)
    const q = await screen.findByTestId('review-queue')
    expect(within(q).getByText('LRU Cache')).toBeInTheDocument()
    expect(within(q).getByText('3d overdue')).toBeInTheDocument()
    await u.click(within(q).getByRole('button', { name: 'LRU Cache: solved cleanly' }))
    await waitFor(() => expect(screen.queryByTestId('review-queue')).not.toBeInTheDocument()) // gone again, not "empty"
    expect((await db.dsaProblems.toArray())[0]).toMatchObject({ reviewDue: null, reviewCount: 1 })
  })

  it('a review due today is shown neutrally (not overdue)', async () => {
    await addDsaProblem({ title: 'Two Sum II', pattern: 'Two pointers', difficulty: 'EASY', status: 'LOOKED_AT_SOLUTION', solvedDate: addDays(T0, -7) })
    render(<TodayScreen />)
    const q = await screen.findByTestId('review-queue')
    expect(within(q).getByText(/due today/)).toBeInTheDocument()
  })

  it('ticking a recurring block annotates ONLY that day (the pattern is untouched)', async () => {
    const u = userEvent.setup()
    render(<TodayScreen />)
    await u.click(await screen.findByRole('checkbox', { name: /Done: Deep A/ }))
    await waitFor(async () => expect(await db.eventOccurrences.count()).toBe(1))
    const ann = (await db.eventOccurrences.toArray())[0]!
    expect(ann).toMatchObject({ status: 'DONE', occurrenceDate: T0 })
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Done: Deep A/ })).toHaveAttribute('aria-checked', 'true'))
    // Tomorrow's Deep A is still open
    await u.click(screen.getByRole('button', { name: formatDay(addDays(T0, 1), 'dddd D MMMM') }))
    expect(await screen.findByRole('checkbox', { name: /Done: Deep A/ })).toHaveAttribute('aria-checked', 'false')
    // and un-ticking removes the annotation
    await u.click(screen.getByRole('button', { name: formatDay(T0, 'dddd D MMMM') }))
    await u.click(await screen.findByRole('checkbox', { name: /Done: Deep A/ }))
    await waitFor(async () => expect((await db.eventOccurrences.toArray()).filter((a) => !a.deletedAt)).toHaveLength(0))
  })

  it('the week strip selects any day; the title follows, and there is a way back to today', async () => {
    const u = userEvent.setup()
    render(<TodayScreen />)
    const friday = addDays(startOfWeek(T0), 4)
    await u.click(await screen.findByRole('button', { name: formatDay(friday, 'dddd D MMMM') }))
    expect(await screen.findByRole('button', { name: 'Back to today' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Back to today' }))
    expect(await screen.findByRole('heading', { name: 'today' })).toBeInTheDocument()
  })

  it('the log card opens the sheet for the selected day', async () => {
    const u = userEvent.setup()
    render(<TodayScreen />)
    await u.click(await screen.findByTestId('open-log'))
    expect(useUi.getState().log.open).toBe(true)
  })

  it('tapping a block opens the log sheet PRE-FILLED with its track and planned minutes (nothing written)', async () => {
    const u = userEvent.setup()
    render(<TodayScreen />)
    await u.click(await screen.findByRole('button', { name: /Deep A.*open log/ }))
    expect(useUi.getState().log).toMatchObject({ open: true, prefill: { track: 'DSA', minutes: 120 } })
    expect(await db.logBlocks.count()).toBe(0)
  })
})
