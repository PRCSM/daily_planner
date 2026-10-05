import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimetableScreen } from './TimetableScreen'
import { db } from '@/data/db'
import { freshDbPerTest } from '@/test/db'

freshDbPerTest()

describe('Timetable — paint mode', () => {
  it('fills a 5-day × 6-period week in ~45 taps and ONE keyboard summon', async () => {
    const u = userEvent.setup()
    render(<TimetableScreen />)
    let taps = 0
    let summons = 0
    const tap = async (el: HTMLElement) => (taps++, await u.click(el))

    // ONE keyboard summon: open the field once and type every subject, each ended with Enter (focus stays).
    await tap(await screen.findByRole('button', { name: '+ New subject' }))
    const field = await screen.findByLabelText('New subject')
    summons++
    await u.type(field, 'Maths{Enter}Physics{Enter}Algorithms{Enter}DBMS{Enter}OS{Enter}Lab{Enter}')
    await tap(screen.getByRole('button', { name: 'Done' }))

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const times = ['09:00', '09:50', '10:40', '11:30', '12:20', '13:10']
    const subjects = ['Maths', 'Physics', 'Algorithms', 'DBMS', 'OS', 'Lab']
    // Paint by subject: select the chip once, then tap its cells.
    for (const [i, subject] of subjects.entries()) {
      await tap(await screen.findByRole('button', { name: subject, pressed: false }))
      for (const day of days) await tap(screen.getByRole('button', { name: new RegExp(`^${day} ${times[i]}`) }))
    }
    expect(summons).toBe(1)
    expect(taps).toBeLessThanOrEqual(45)
    await waitFor(async () => expect(await db.timetableSlots.count()).toBe(30))
    const slots = await db.timetableSlots.toArray()
    expect(slots.find((s) => s.dayOfWeek === 1 && s.startTime === '09:00')).toMatchObject({ title: 'Maths', endTime: '09:50', kind: 'CLASS' })
    expect(slots.find((s) => s.title === 'Lab')!.kind).toBe('LAB')
  })

  it('tapping a cell with no subject chosen does nothing; the eraser clears a cell; repainting replaces', async () => {
    const u = userEvent.setup()
    render(<TimetableScreen />)
    await u.click(await screen.findByRole('button', { name: '+ New subject' }))
    await u.type(await screen.findByLabelText('New subject'), 'Maths{Enter}Physics{Enter}')
    const cell = screen.getByRole('button', { name: /^Mon 09:00/ })
    await u.click(await screen.findByRole('button', { name: 'Physics', pressed: true })) // a new subject selects itself; deselect it
    await u.click(cell)
    expect(await db.timetableSlots.count()).toBe(0)
    await u.click(screen.getByRole('button', { name: 'Maths' }))
    await u.click(cell)
    await waitFor(async () => expect(await db.timetableSlots.count()).toBe(1))
    await u.click(screen.getByRole('button', { name: 'Physics' }))
    await u.click(cell)
    await waitFor(async () => expect((await db.timetableSlots.toArray())[0]!.title).toBe('Physics'))
    expect(await db.timetableSlots.count()).toBe(1)
    await u.click(screen.getByRole('button', { name: 'Eraser' }))
    await u.click(cell)
    await waitFor(async () => expect((await db.timetableSlots.toArray()).filter((s) => !s.deletedAt)).toHaveLength(0))
  })
})

describe('Timetable — import with a REVIEW step', () => {
  async function openImport(u: ReturnType<typeof userEvent.setup>) {
    render(<TimetableScreen />)
    await u.click(await screen.findByRole('button', { name: /Import \.ics/ }))
  }
  const csv = (rows: string) => new File([`title,day,start,end,location\n${rows}`], 'week.csv', { type: 'text/csv' })

  it('shows what was parsed (and what was wrong) and writes NOTHING until confirmed', async () => {
    const u = userEvent.setup()
    await openImport(u)
    await u.upload(screen.getByLabelText('Choose a timetable file'), csv('Maths,Mon,9,10,B1\nPhysics Lab,Tue,2pm,4pm,\nBroken,Someday,9,10,'))
    const review = await screen.findByTestId('import-review')
    expect(within(review).getByText(/2 slots found, 1 problem/)).toBeInTheDocument()
    expect(within(review).getByLabelText('Problems')).toHaveTextContent('line 4')
    expect(await db.timetableSlots.count()).toBe(0)
  })

  it('imports only the ticked rows, replacing the old timetable (old rows soft-deleted)', async () => {
    const u = userEvent.setup()
    const { addSlot } = await import('@/data/repos/timetable')
    await addSlot({ title: 'Old', dayOfWeek: 3, startTime: '09:00', endTime: '10:00', kind: 'CLASS', active: true })
    await openImport(u)
    await u.upload(screen.getByLabelText('Choose a timetable file'), csv('Maths,Mon,9,10,\nPhysics Lab,Tue,2pm,4pm,'))
    const review = await screen.findByTestId('import-review')
    await u.click(within(review).getByRole('checkbox', { name: 'Import Physics Lab' })) // untick one
    await u.click(within(review).getByRole('button', { name: 'Import 1 slot' }))
    await waitFor(async () => expect((await db.timetableSlots.toArray()).filter((s) => !s.deletedAt).map((s) => s.title)).toEqual(['Maths']))
    expect(await screen.findByRole('status')).toHaveTextContent('Imported 1 slot.')
  })

  it('"Add to it" keeps existing slots and skips exact duplicates', async () => {
    const u = userEvent.setup()
    const { addSlot } = await import('@/data/repos/timetable')
    await addSlot({ title: 'Maths', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', kind: 'CLASS', active: true })
    await openImport(u)
    await u.upload(screen.getByLabelText('Choose a timetable file'), csv('Maths,Mon,9,10,\nChem,Wed,11,12,'))
    const review = await screen.findByTestId('import-review')
    await u.click(within(review).getByRole('button', { name: 'Add to it' }))
    await u.click(within(review).getByRole('button', { name: /Import 2 slots/ }))
    await waitFor(async () => expect((await db.timetableSlots.toArray()).filter((s) => !s.deletedAt)).toHaveLength(2))
  })

  it('a malformed file is explained, not imported', async () => {
    const u = userEvent.setup()
    await openImport(u)
    await u.upload(screen.getByLabelText('Choose a timetable file'), new File(['just some text'], 'notes.ics', { type: 'text/calendar' }))
    expect(await screen.findByText(/doesn’t look like an .ics/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull()
  })
})
