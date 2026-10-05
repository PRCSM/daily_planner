import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { ProgressScreen } from './ProgressScreen'
import { DsaScreen } from './DsaScreen'
import { MemoryRouter } from 'react-router'
import { ensureSeeded } from '@/data/seed'
import { addDsaProblem, addLogBlock, setFuel } from '@/features/services/logging'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'

freshDbPerTest()
const wrap = (el: React.ReactNode) => <MemoryRouter>{el}</MemoryRouter>
const solve = (title: string, pattern: string, status: 'SOLVED_UNAIDED' | 'SOLVED_WITH_HINT' | 'LOOKED_AT_SOLUTION' | 'FAILED') => addDsaProblem({ title, pattern, difficulty: 'MEDIUM', status, solvedDate: T0 })

describe('Progress', () => {
  it('AI-off meter is NULL ("—", not 0% and not 100%) when no learning blocks exist — even if shipping blocks used AI', async () => {
    await ensureSeeded()
    await addLogBlock({ date: T0, track: 'PROJECT', minutes: 60, aiUsed: true })
    render(wrap(<ProgressScreen />))
    const meter = await screen.findByTestId('ai-off-meter')
    expect(meter).toHaveTextContent('—')
    expect(meter).toHaveTextContent(/nothing to measure/)
    expect(meter.textContent).not.toMatch(/\b(0|100)%/)
  })

  it('reports the % of learning blocks that were AI-free this week, and lists flagged blocks in amber (factual, not shaming)', async () => {
    await ensureSeeded()
    await addLogBlock({ date: T0, track: 'DSA', minutes: 60, aiUsed: false })
    await addLogBlock({ date: T0, track: 'CORE_CS', minutes: 60, aiUsed: false, topic: 'B+ trees' })
    await addLogBlock({ date: addDays(T0, 1), track: 'DSA', minutes: 30, aiUsed: true, topic: 'LRU' })
    await addLogBlock({ date: addDays(T0, 1), track: 'PROJECT', minutes: 90, aiUsed: true }) // shipping: ignored
    render(wrap(<ProgressScreen />))
    const meter = await screen.findByTestId('ai-off-meter')
    await waitFor(() => expect(meter).toHaveTextContent('67%'))
    const flagged = within(meter).getByLabelText('Learning blocks that used AI this week')
    expect(within(flagged).getAllByRole('listitem')).toHaveLength(1)
    expect(flagged).toHaveTextContent('LRU')
  })

  it('sleep chart says "not enough data" until there are 2 ENTERED days; carried defaults never count', async () => {
    await ensureSeeded()
    await addLogBlock({ date: T0, track: 'DSA', minutes: 30, aiUsed: false })
    render(wrap(<ProgressScreen />))
    expect(await screen.findByText(/Not enough data yet — only days where you entered sleep/)).toBeInTheDocument()
    await setFuel(T0, { sleepHours: 6 })
    await setFuel(addDays(T0, -1), { sleepHours: 7 })
    await waitFor(() => expect(screen.queryByText(/Not enough data yet — only days/)).not.toBeInTheDocument())
  })

  it('shows DSA done / seeded-sum target and a heatmap with a lit square for a logged day', async () => {
    await ensureSeeded()
    await solve('a', 'Arrays', 'SOLVED_UNAIDED')
    await addLogBlock({ date: T0, track: 'DSA', minutes: 130, aiUsed: false })
    render(wrap(<ProgressScreen />))
    expect(await screen.findByText('1 of 363 DSA problems')).toBeInTheDocument()
    const heat = screen.getByTestId('heatmap')
    await waitFor(() => expect(heat.querySelector('[data-level="3"]')).not.toBeNull())
  })
})

describe('DSA pattern coverage', () => {
  it('unaided rate = SOLVED_UNAIDED / total attempts', async () => {
    for (const [i, s] of (['SOLVED_UNAIDED', 'SOLVED_UNAIDED', 'SOLVED_WITH_HINT', 'FAILED'] as const).entries()) await solve(`g${i}`, 'Graphs', s)
    render(wrap(<DsaScreen />))
    const row = (await screen.findAllByTestId('pattern-row')).find((r) => within(r).queryByText('Graphs'))!
    expect(row).toHaveTextContent('4')
    expect(row).toHaveTextContent('50%')
    expect(within(row).queryByText('weak')).toBeNull() // exactly at the threshold is not weak
  })

  it('NEVER flags a pattern weak below 3 attempts — shows "few" instead', async () => {
    await solve('t1', 'Tries', 'FAILED')
    await solve('t2', 'Tries', 'FAILED')
    render(wrap(<DsaScreen />))
    const row = (await screen.findAllByTestId('pattern-row')).find((r) => within(r).queryByText('Tries'))!
    expect(within(row).queryByText('weak')).toBeNull()
    expect(within(row).getByText('few')).toBeInTheDocument()
  })

  it('flags weak at 3+ attempts with a low unaided rate; untouched patterns show "—" (no rate), never 0%', async () => {
    for (const i of [1, 2, 3]) await solve(`d${i}`, 'DP', 'LOOKED_AT_SOLUTION')
    render(wrap(<DsaScreen />))
    const rows = await screen.findAllByTestId('pattern-row')
    const dp = rows.find((r) => within(r).queryByText('DP'))!
    expect(within(dp).getByText('weak')).toBeInTheDocument()
    const heaps = rows.find((r) => within(r).queryByText('Heaps'))!
    expect(heaps).toHaveTextContent('—')
    expect(heaps.textContent).not.toMatch(/0%/)
  })

  it('counts outcomes by status', async () => {
    await solve('a', 'Arrays', 'SOLVED_UNAIDED')
    await solve('b', 'Arrays', 'FAILED')
    render(wrap(<DsaScreen />))
    expect(await screen.findByText('2 attempts · 1 done')).toBeInTheDocument()
  })
})
