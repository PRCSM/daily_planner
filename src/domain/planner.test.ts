import { describe, expect, it } from 'vitest'
import { DAY_END, DAY_START, HOUR_PX, applyDrag, barrierMessage, findBarrier, geometry, layoutColumns, minutesAtY, overlaps, slotsOnDay } from './planner'
import { toMinutes } from './dates'

const lab = { title: 'Physics lab', startTime: '09:00', endTime: '11:00' }

describe('barriers (timetable slots are IMMOVABLE)', () => {
  it('overlap is half-open: touching edges do not collide', () => {
    expect(overlaps({ start: 540, end: 600 }, { start: 600, end: 660 })).toBe(false)
    expect(overlaps({ start: 540, end: 601 }, { start: 600, end: 660 })).toBe(true)
  })
  it('names the slot it hit', () => {
    expect(findBarrier([lab], { start: toMinutes('10:00'), end: toMinutes('10:30') })).toBe(lab)
    expect(findBarrier([lab], { start: toMinutes('11:00'), end: toMinutes('12:00') })).toBeNull()
    expect(findBarrier([lab], { start: toMinutes('08:00'), end: toMinutes('09:00') })).toBeNull()
    expect(barrierMessage(lab)).toBe('That overlaps Physics lab (09:00–11:00).')
  })
  it('returns the EARLIEST of several hits', () => {
    const later = { title: 'Maths', startTime: '10:00', endTime: '12:00' }
    expect(findBarrier([later, lab], { start: toMinutes('09:30'), end: toMinutes('11:30') })).toBe(lab)
  })
  it('slotsOnDay filters by weekday and active', () => {
    const s = [{ title: 'a', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }, { title: 'b', dayOfWeek: 2, startTime: '09:00', endTime: '10:00' }, { title: 'c', dayOfWeek: 1, startTime: '10:00', endTime: '11:00', active: false }]
    expect(slotsOnDay(s, 1).map((x) => x.title)).toEqual(['a'])
  })
})

describe('applyDrag — snap, clamp, spring back', () => {
  const task = { start: '14:00', end: '15:00' }
  it('moves snapped to 15 minutes', () => {
    expect(applyDrag(task, 'move', 37, [])).toMatchObject({ start: '14:30', end: '15:30', collision: null, changed: true })
    expect(applyDrag(task, 'move', 38, [])).toMatchObject({ start: '14:45', end: '15:45' })
    expect(applyDrag(task, 'move', 7, [])).toMatchObject({ start: '14:00', changed: false })
    expect(applyDrag(task, 'move', 8, [])).toMatchObject({ start: '14:15', end: '15:15' })
  })
  it('keeps duration while moving and clamps to the 06:00–23:00 day', () => {
    expect(applyDrag(task, 'move', -10_000, [])).toMatchObject({ start: '06:00', end: '07:00' })
    expect(applyDrag(task, 'move', 10_000, [])).toMatchObject({ start: '22:00', end: '23:00' })
  })
  it('resize changes only the end, snapped, with a 15-minute minimum', () => {
    expect(applyDrag(task, 'resize', 58, [])).toMatchObject({ start: '14:00', end: '16:00' })
    expect(applyDrag(task, 'resize', -500, [])).toMatchObject({ start: '14:00', end: '14:15' })
    expect(applyDrag(task, 'resize', 10_000, [])).toMatchObject({ end: '23:00' })
  })
  it('a drop onto a timetable slot SPRINGS BACK to the original and names what it hit', () => {
    const out = applyDrag({ start: '12:00', end: '13:00' }, 'move', -150, [lab]) // → 09:30
    expect(out.collision).toBe(lab)
    expect(out).toMatchObject({ start: '12:00', end: '13:00', changed: false })
  })
  it('a resize INTO a slot is refused too', () => {
    const out = applyDrag({ start: '08:00', end: '08:30' }, 'resize', 60, [lab])
    expect(out.collision).toBe(lab)
    expect(out.end).toBe('08:30')
  })
  it('landing exactly flush against a slot is fine', () => {
    expect(applyDrag({ start: '12:00', end: '13:00' }, 'move', -60, [lab])).toMatchObject({ start: '11:00', collision: null })
  })
  it('task-on-task overlap is allowed (barriers only come from the timetable)', () => {
    expect(applyDrag(task, 'move', 0, []).collision).toBeNull()
  })
})

describe('layoutColumns — overlapping tasks sit side by side', () => {
  const t = (id: string, start: string, end: string) => ({ id, start, end })
  it('non-overlapping tasks each get the full width', () => {
    const m = layoutColumns([t('a', '09:00', '10:00'), t('b', '10:00', '11:00')])
    expect([m.get('a'), m.get('b')]).toEqual([{ id: 'a', col: 0, cols: 1 }, { id: 'b', col: 0, cols: 1 }])
  })
  it('two overlapping tasks share two columns', () => {
    const m = layoutColumns([t('a', '09:00', '10:30'), t('b', '10:00', '11:00')])
    expect([m.get('a')!.col, m.get('b')!.col, m.get('a')!.cols]).toEqual([0, 1, 2])
  })
  it('a chain a∩b, b∩c reuses column 0 for c but keeps one cluster width', () => {
    const m = layoutColumns([t('a', '09:00', '10:00'), t('b', '09:30', '11:00'), t('c', '10:30', '11:30')])
    expect(m.get('a')!.col).toBe(0)
    expect(m.get('b')!.col).toBe(1)
    expect(m.get('c')!.col).toBe(0)
    expect(new Set([...m.values()].map((p) => p.cols))).toEqual(new Set([2]))
  })
  it('three-way overlap → three columns; a later separate task is its own cluster', () => {
    const m = layoutColumns([t('a', '09:00', '11:00'), t('b', '09:00', '11:00'), t('c', '09:00', '11:00'), t('d', '13:00', '14:00')])
    expect([m.get('a')!.cols, m.get('d')!.cols]).toEqual([3, 1])
    expect(new Set(['a', 'b', 'c'].map((id) => m.get(id)!.col)).size).toBe(3)
  })
  it('a zero-length task still occupies the minimum', () => {
    const m = layoutColumns([t('a', '09:00', '09:00'), t('b', '09:05', '09:30')])
    expect(m.get('a')!.cols).toBe(2)
  })
  it('empty → empty', () => expect(layoutColumns([]).size).toBe(0))
})

describe('geometry', () => {
  it('06:00 is the top; an hour is HOUR_PX tall', () => {
    expect(geometry('06:00', '07:00')).toEqual({ top: 0, height: HOUR_PX })
    expect(geometry('09:30', '10:00')).toEqual({ top: 3.5 * HOUR_PX, height: HOUR_PX / 2 })
  })
  it('y → snapped minutes, clamped', () => {
    expect(minutesAtY(0)).toBe(DAY_START)
    expect(minutesAtY(HOUR_PX * 3.1)).toBe(DAY_START + 180)
    expect(minutesAtY(99999)).toBe(DAY_END - 15)
  })
})
