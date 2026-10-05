import { describe, expect, it, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlannerScreen } from './PlannerScreen'
import { TaskSheet } from './TaskSheet'
import { LogSheet } from '@/features/log/LogSheet'
import { useUi } from '@/features/store'
import { db } from '@/data/db'
import { addSlot } from '@/data/repos/timetable'
import { addPlannerTask } from '@/features/services/planner'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { HOUR_PX } from '@/domain/planner'

freshDbPerTest()
beforeEach(async () => {
  useUi.setState({ sheet: { name: null }, log: { open: false, date: null, prefill: null }, plannerDate: null })
  // Monday (dayOfWeek 1) has Physics lab 09:00–11:00 — T0 is a Monday.
  await addSlot({ title: 'Physics lab', dayOfWeek: 1, startTime: '09:00', endTime: '11:00', kind: 'LAB', active: true })
})

const ui = () => (
  <>
    <PlannerScreen />
    <TaskSheet />
    <LogSheet />
  </>
)
const mkTask = async (title: string, startTime?: string, endTime?: string, extra: object = {}) => {
  const r = await addPlannerTask({ date: T0, title, startTime, endTime, priority: 'MUST', ...extra })
  if (!r.ok) throw new Error(r.reason)
  return r.task
}
const block = (title: string) => screen.findAllByTestId('task-block').then((bs) => bs.find((b) => within(b).queryByText(title))!)
const drag = (el: HTMLElement, dy: number) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientY: 100, button: 0 })
  fireEvent.pointerMove(el, { pointerId: 1, clientY: 100 + dy })
  fireEvent.pointerUp(el, { pointerId: 1, clientY: 100 + dy })
}
const timesOf = async (title: string) => {
  const t = (await db.plannerTasks.toArray()).find((x) => x.title === title)!
  return [t.startTime, t.endTime]
}

describe('Planner', () => {
  it('pre-draws the timetable as fixed barriers', async () => {
    render(ui())
    const barrier = await screen.findByTestId('barrier')
    expect(barrier).toHaveAccessibleName('Physics lab, 09:00 to 11:00, fixed')
    expect(barrier.style.top).toBe(`${3 * HOUR_PX}px`) // 09:00 is 3h after the 06:00 top
  })

  it('tasks that overlap sit SIDE BY SIDE in columns (intent can overlap)', async () => {
    await mkTask('A', '13:00', '14:30')
    await mkTask('B', '14:00', '15:00')
    render(ui())
    const [a, b] = [await block('A'), await block('B')]
    expect(a.style.width).toBe('calc(50% - 6px)')
    expect(b.style.width).toBe('calc(50% - 6px)')
    expect(a.style.left).not.toBe(b.style.left)
  })

  it('dragging moves a task, snapped to 15 minutes, and persists', async () => {
    await mkTask('Design doc', '13:00', '14:00')
    render(ui())
    drag(await block('Design doc'), HOUR_PX / 2 + 3) // ≈ 33 min → snaps to 30
    await waitFor(async () => expect(await timesOf('Design doc')).toEqual(['13:30', '14:30']))
  })

  it('dragging the handle resizes (end only)', async () => {
    await mkTask('Resize me', '13:00', '14:00')
    render(ui())
    const handle = within(await block('Resize me')).getByRole('slider')
    drag(handle, HOUR_PX) // +60 min
    await waitFor(async () => expect(await timesOf('Resize me')).toEqual(['13:00', '15:00']))
  })

  it('a drop onto the timetable SPRINGS BACK, names what it hit, and changes nothing', async () => {
    await mkTask('Study', '12:00', '13:00')
    render(ui())
    drag(await block('Study'), -2.4 * HOUR_PX) // → ~09:36, inside the lab
    expect(await screen.findByTestId('notice')).toHaveTextContent('That overlaps Physics lab (09:00–11:00).')
    expect(await timesOf('Study')).toEqual(['12:00', '13:00'])
  })

  it('a tap (no movement) opens the task for editing', async () => {
    await mkTask('Tap me', '15:00', '16:00')
    render(ui())
    drag(await block('Tap me'), 0)
    expect(useUi.getState().sheet).toMatchObject({ name: 'task' })
  })

  it('marking DONE PRE-FILLS the log sheet (track, planned minutes, topic) and writes NO block', async () => {
    const u = userEvent.setup()
    await mkTask('URL shortener', '14:00', '15:30', { track: 'SYSTEM_DESIGN' })
    render(ui())
    await u.click(await screen.findByRole('checkbox', { name: 'Done: URL shortener' }))
    await waitFor(() => expect(useUi.getState().log.open).toBe(true))
    expect(useUi.getState().log.prefill).toEqual({ track: 'SYSTEM_DESIGN', minutes: 90, topic: 'URL shortener' })
    expect(await db.logBlocks.count()).toBe(0) // planned minutes are not measured minutes
    expect((await db.plannerTasks.toArray())[0]!.status).toBe('DONE')
    expect(await screen.findByDisplayValue('URL shortener')).toBeInTheDocument()
  })

  it('un-ticking does not open the log', async () => {
    const u = userEvent.setup()
    const t = await mkTask('x', '14:00', '15:00')
    await db.plannerTasks.update(t.id, { status: 'DONE' })
    render(ui())
    await u.click(await screen.findByRole('checkbox', { name: 'Done: x' }))
    await waitFor(async () => expect((await db.plannerTasks.toArray())[0]!.status).toBe('TODO'))
    expect(useUi.getState().log.open).toBe(false)
  })

  it('the task form refuses a time inside a timetable slot and names it', async () => {
    const u = userEvent.setup()
    render(ui())
    useUi.getState().openSheet('task', { date: T0 })
    const sheet = await screen.findByTestId('task-sheet')
    await u.type(within(sheet).getByLabelText('Task'), 'Deep work')
    fireEvent.change(within(sheet).getByLabelText('Start time'), { target: { value: '10:00' } })
    fireEvent.change(within(sheet).getByLabelText('End time'), { target: { value: '11:30' } })
    await u.click(within(sheet).getByRole('button', { name: 'Add task' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('That overlaps Physics lab (09:00–11:00).')
    expect(await db.plannerTasks.count()).toBe(0)
    fireEvent.change(within(sheet).getByLabelText('Start time'), { target: { value: '11:00' } }) // flush against the slot is fine
    fireEvent.change(within(sheet).getByLabelText('End time'), { target: { value: '12:00' } })
    await u.click(within(sheet).getByRole('button', { name: 'Add task' }))
    await waitFor(async () => expect(await db.plannerTasks.count()).toBe(1))
  })

  it('"Plan tomorrow": carries unfinished work forward (UNTIMED), drops others, queues new tasks, sets an intention', async () => {
    const u = userEvent.setup()
    await mkTask('Unfinished', '15:00', '16:00')
    await mkTask('Not happening', '16:00', '17:00')
    render(ui())
    await u.click(await screen.findByTestId('plan-tomorrow'))
    const sheet = await screen.findByTestId('plan-tomorrow-sheet')
    const items = within(sheet).getAllByTestId('carry-item')
    await u.click(within(items.find((i) => within(i).queryByText('Unfinished'))!).getByRole('button', { name: /Move to/ }))
    await u.click(within(items.find((i) => within(i).queryByText('Not happening'))!).getByRole('button', { name: 'Drop' }))
    await u.type(within(sheet).getByLabelText('Task for tomorrow'), 'Mock interview{Enter}')
    await u.type(within(sheet).getByLabelText('Intention for tomorrow'), 'Ship the sync worker')
    await u.tab()
    await waitFor(async () => {
      const tasks = await db.plannerTasks.toArray()
      expect(tasks.find((t) => t.title === 'Unfinished' && t.status === 'MOVED')).toBeTruthy()
      expect(tasks.find((t) => t.title === 'Unfinished' && t.status === 'TODO')).toMatchObject({ startTime: undefined })
      expect(tasks.find((t) => t.title === 'Not happening')!.status).toBe('SKIPPED')
      expect(tasks.find((t) => t.title === 'Mock interview')).toMatchObject({ status: 'TODO', priority: 'MUST' })
    })
    await waitFor(async () => expect((await db.plannerDays.toArray()).some((d) => d.intention === 'Ship the sync worker')).toBe(true))
    const days = await db.plannerDays.toArray()
    expect(days).toHaveLength(2) // today's + tomorrow's
  })

  it('shows the planner day for the selected date and the FAB "Add task" can target it', async () => {
    render(ui())
    expect(await screen.findByRole('application', { name: 'Day timeline' })).toBeInTheDocument()
    await waitFor(() => expect(useUi.getState().plannerDate).toBe(T0))
  })
})
