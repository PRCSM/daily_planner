import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarScreen } from './CalendarScreen'
import { EventSheet } from './EventSheet'
import { useUi } from '@/features/store'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { addDays, formatDay } from '@/domain/dates'

freshDbPerTest()
beforeEach(async () => {
  useUi.setState({ calendarFilters: [], sheet: { name: null } })
  await ensureSeeded()
})
const ui = () => (
  <>
    <CalendarScreen />
    <EventSheet />
  </>
)
const cell = (d: string) => screen.getByRole('gridcell', { name: new RegExp(`^${formatDay(d, 'dddd D MMMM')}`) })

describe('Calendar', () => {
  it('draws markers by shape for seeded milestones; the 2 Aug HARD milestone is a bar', async () => {
    render(ui())
    const d = '2026-08-02'
    await waitFor(() => expect(cell(d).getAttribute('aria-label')).toMatch(/item/))
    expect(cell(d).querySelector('span[title="Mimora deploy done"]')!.className).toMatch(/h-1 w-4/) // filled bar
  })

  it('colour ONLY for HARD-and-imminent: the résumé deadline 12 days out is danger; the milestone already past is not', async () => {
    render(ui())
    const soon = '2026-08-15' // T0 + 12 days, HARD, not done
    await waitFor(() => expect(cell(soon).getAttribute('aria-label')).toMatch(/item/))
    expect(cell(soon).querySelector('span[title="RESUME + GITHUB + PORTFOLIO SHIPPED"]')!.className).toMatch(/text-danger/)
    expect(cell('2026-08-02').querySelector('span[title="Mimora deploy done"]')!.className).not.toMatch(/text-danger/)
  })

  it('tapping a day opens its agenda, including study blocks; ticking an item persists', async () => {
    const u = userEvent.setup()
    render(ui())
    await u.click(cell(T0))
    const sheet = await screen.findByTestId('agenda-sheet')
    expect(await within(sheet).findByText(/Deep A/)).toBeInTheDocument()
    await u.click(within(sheet).getByRole('checkbox', { name: /Done: Deep A/ }))
    await waitFor(async () => expect(await db.eventOccurrences.count()).toBe(1))
  })

  it('filter chips narrow the grid; Study is off by default and appears when selected', async () => {
    const u = userEvent.setup()
    render(ui())
    await waitFor(() => expect(cell(addDays(T0, 1)).getAttribute('aria-label')).not.toMatch(/item/))
    await u.click(screen.getByRole('button', { name: 'Study' }))
    await waitFor(() => expect(cell(addDays(T0, 1)).getAttribute('aria-label')).toMatch(/items?/))
  })

  it('adds a custom event from the sheet and it shows on the grid', async () => {
    const u = userEvent.setup()
    render(ui())
    const target = addDays(T0, 2)
    await u.click(cell(target))
    await u.click(await screen.findByRole('button', { name: 'Add event on this day' }))
    const sheet = await screen.findByTestId('event-sheet')
    await u.type(within(sheet).getByLabelText('Title'), 'Mock interview')
    await u.click(within(sheet).getByRole('button', { name: 'Hard deadline' }))
    await u.click(within(sheet).getByRole('button', { name: 'Add event' }))
    await waitFor(async () => expect((await db.events.toArray()).some((e) => e.title === 'Mock interview' && e.type === 'CUSTOM' && e.criticality === 'HARD' && e.date === target)).toBe(true))
    await waitFor(() => expect(cell(target).querySelector('span[title="Mock interview"]')).not.toBeNull())
  })

  it('validates input before writing (end before start is rejected)', async () => {
    const u = userEvent.setup()
    render(ui())
    useUi.getState().openSheet('event', { date: T0 })
    const sheet = await screen.findByTestId('event-sheet')
    await u.type(within(sheet).getByLabelText('Title'), 'x')
    await u.type(within(sheet).getByLabelText('Start time'), '10:00')
    await u.type(within(sheet).getByLabelText('End time'), '09:00')
    await u.click(within(sheet).getByRole('button', { name: 'Add event' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/after the start/)
    expect((await db.events.toArray()).some((e) => e.title === 'x')).toBe(false)
  })

  it('editing a seeded event marks it userModified and keeps it across a re-seed', async () => {
    const u = userEvent.setup()
    render(ui())
    const mimora = (await db.events.toArray()).find((e) => e.title === 'Mimora deploy done')!
    useUi.getState().openSheet('event', { id: mimora.id })
    const sheet = await screen.findByTestId('event-sheet')
    await waitFor(() => expect(within(sheet).getByLabelText('Title')).toHaveValue('Mimora deploy done'))
    expect(within(sheet).getByText(/won’t overwrite it/)).toBeInTheDocument()
    await u.clear(within(sheet).getByLabelText('Title'))
    await u.type(within(sheet).getByLabelText('Title'), 'Mimora live')
    await u.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await db.events.get(mimora.id))!.title).toBe('Mimora live'))
    await ensureSeeded(true)
    expect((await db.events.get(mimora.id))!.title).toBe('Mimora live')
    expect((await db.events.get(mimora.id))!.userModified).toBe(true)
  })
})
