import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { PlanScreen } from './PlanScreen'
import { WeekScreen } from './WeekScreen'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { saveWeeklyReview } from '@/features/services/plan'
import { addDsaProblem, patchDay } from '@/features/services/logging'
import { freshDbPerTest } from '@/test/db'
import { setClockSource, localDate } from '@/lib/clock'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'

freshDbPerTest()
beforeEach(async () => {
  await ensureSeeded()
})
const at = (n: number) => setClockSource(() => localDate(addDays(T0, n), '10:00'))
const row = (n: number) => screen.findByRole('link', { name: `Week ${n}` })

const plan = () => (
  <MemoryRouter initialEntries={['/plan']}>
    <Routes>
      <Route path="/plan" element={<PlanScreen />} />
    </Routes>
  </MemoryRouter>
)

describe('Plan screen — honest verdicts', () => {
  it('Monday morning of week 4 is NOT red (pro-rata: nothing has elapsed), even with 0 done', async () => {
    render(plan())
    const w4 = await row(4)
    expect(w4.querySelector('.text-danger')).toBeNull()
  })

  it('mid-week, behind pro-rata IS red and says by how much', async () => {
    at(3) // Thursday: 3 days completed → expected floor(28*3/7) = 12
    render(plan())
    const w4 = await row(4)
    await waitFor(() => expect(w4.querySelector('.text-danger')).not.toBeNull())
    expect(w4).toHaveTextContent('−12')
  })

  it('meeting the pro-rata pace is uncoloured — on track spends no colour', async () => {
    at(3)
    for (let i = 0; i < 12; i++) await addDsaProblem({ title: `p${i}`, pattern: 'Arrays', difficulty: 'EASY', status: 'SOLVED_UNAIDED', solvedDate: T0 })
    await patchDay(T0, { applicationsSent: 1 }) // applications are judged pro-rata too: floor(3*3/7) = 1
    render(plan())
    const w4 = await row(4)
    await waitFor(() => expect(w4).toHaveTextContent('12/28'))
    expect(w4.querySelector('.text-danger')).toBeNull()
  })

  it('PAST weeks are judged on the raw target; FUTURE weeks show the target and NO verdict (never green, never red)', async () => {
    at(0)
    render(plan())
    const w1 = await row(1)
    expect(w1.querySelector('.text-danger')).not.toBeNull() // week 1 ended with 0/3
    const w10 = await row(10)
    expect(w10.querySelector('.text-danger')).toBeNull()
    expect(w10).toHaveTextContent('24') // just the target
    expect(w10.textContent).not.toMatch(/0\/24/)
  })

  it('shows 18 weeks, the current week marked, and the phase strip', async () => {
    render(plan())
    await row(18)
    expect(screen.getAllByRole('link', { name: /^Week \d+$/ })).toHaveLength(18)
    expect(within(await row(4)).getByLabelText('current week')).toBeInTheDocument()
    expect(screen.getByLabelText('Phases')).toHaveTextContent('Under the abstractions')
  })

  it('no burnout card by default', async () => {
    render(plan())
    await row(1)
    expect(screen.queryByTestId('burnout-card')).not.toBeInTheDocument()
  })

  it('two consecutive explicit "no" answers show the NON-DISMISSIBLE card with reduced targets', async () => {
    await saveWeeklyReview(3, { q5FuelOk: false })
    await saveWeeklyReview(4, { q5FuelOk: false })
    render(plan())
    const card = await screen.findByTestId('burnout-card')
    expect(card).toHaveTextContent('Cut the plan 25% this week.')
    expect(card).toHaveTextContent('21 DSA problems (not 28)')
    expect(within(card).queryByRole('button')).toBeNull() // no dismiss control
  })

  it('false → null → false does NOT flag (an unanswered week breaks the run)', async () => {
    await saveWeeklyReview(2, { q5FuelOk: false })
    await saveWeeklyReview(3, { q5FuelOk: null, q1Dsa: 'skipped fuel' })
    await saveWeeklyReview(4, { q5FuelOk: false })
    render(plan())
    await row(4)
    expect(screen.queryByTestId('burnout-card')).not.toBeInTheDocument()
    expect((await db.weeklyReviews.toArray()).every((r) => r.burnoutFlag === false)).toBe(true)
  })
})

describe('Sunday review form', () => {
  const week = (n: number) => (
    <MemoryRouter initialEntries={[`/plan/week/${n}`]}>
      <Routes>
        <Route path="/plan/week/:n" element={<WeekScreen />} />
      </Routes>
    </MemoryRouter>
  )

  it('Q5 is a REAL three-state control: nothing selected by default, tapping the selected chip clears it, and null is stored', async () => {
    const u = userEvent.setup()
    render(week(4))
    const form = await screen.findByTestId('review-form')
    const yes = within(form).getByTestId('tri-yes')
    const no = within(form).getByTestId('tri-no')
    expect([yes, no].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
    expect(await db.weeklyReviews.count()).toBe(0) // merely opening the form answers nothing
    await u.click(no)
    await waitFor(async () => expect((await db.weeklyReviews.toArray())[0]!.q5FuelOk).toBe(false))
    await u.click(no) // tap again → clear
    await waitFor(async () => expect((await db.weeklyReviews.toArray())[0]!.q5FuelOk).toBeNull())
    await waitFor(() => expect(no).toHaveAttribute('aria-pressed', 'false'))
  })

  it('answering "no" in two consecutive weeks sets burnoutFlag on the second review', async () => {
    const u = userEvent.setup()
    await saveWeeklyReview(3, { q5FuelOk: false })
    render(week(4))
    await u.click(within(await screen.findByTestId('review-form')).getByTestId('tri-no'))
    await waitFor(async () => expect((await db.weeklyReviews.where('weekNumber').equals(4).first())?.burnoutFlag).toBe(true))
    expect((await db.weeklyReviews.where('weekNumber').equals(3).first())!.burnoutFlag).toBe(false)
    expect(await screen.findByTestId('burnout-card')).toBeInTheDocument()
  })

  it('un-answering week 4 clears the flag derived from it (and week 5’s)', async () => {
    await saveWeeklyReview(3, { q5FuelOk: false })
    await saveWeeklyReview(4, { q5FuelOk: false })
    await saveWeeklyReview(5, { q5FuelOk: false })
    expect((await db.weeklyReviews.where('weekNumber').equals(5).first())!.burnoutFlag).toBe(true)
    await saveWeeklyReview(4, { q5FuelOk: null })
    expect((await db.weeklyReviews.where('weekNumber').equals(4).first())!.burnoutFlag).toBe(false)
    expect((await db.weeklyReviews.where('weekNumber').equals(5).first())!.burnoutFlag).toBe(false)
  })

  it('an unknown week id renders a friendly message instead of crashing', async () => {
    render(week(99))
    expect(await screen.findByText(/There is no week “99”/)).toBeInTheDocument()
  })

  it('the pro-rata line explains the current week; a future week says it has not started', async () => {
    at(3)
    const first = render(week(4))
    expect(await screen.findByTestId('verdict-line')).toHaveTextContent('Pro-rata: expected 12 by now, you have 0.')
    first.unmount()
    render(week(9))
    expect(await screen.findByTestId('verdict-line')).toHaveTextContent('Not started — no verdict yet.')
  })

  it('deliverables tick and persist; new ones can be added', async () => {
    const u = userEvent.setup()
    render(week(3))
    await u.click(await screen.findByRole('checkbox', { name: /Done: Mimora deployed/ }))
    await waitFor(async () => expect((await db.deliverables.toArray()).find((d) => d.text.startsWith('Mimora deployed'))!.done).toBe(true))
    await u.type(screen.getByLabelText('New deliverable'), 'Write the README{Enter}')
    await waitFor(async () => expect((await db.deliverables.toArray()).some((d) => d.text === 'Write the README' && d.weekNumber === 3)).toBe(true))
  })
})
