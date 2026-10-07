import { describe, expect, it } from 'vitest'
import { capgToday } from './capgemini'
import { mkPack } from '@/test/factories'

const P = (title: string, tags: string[]) => mkPack({ title, tags })
const packs = [
  P('Recursion', ['capgemini', 'cg-lesson', 'cg-d4']),
  P('Drill · Recursion', ['capgemini', 'cg-drill', 'cg-d4', 'cg-d7']),
  P('Code · Fibonacci', ['capgemini', 'cg-coding', 'cg-d4']),
  P('Interview · OOP', ['capgemini', 'cg-interview', 'cg-d9']),
  P('Binary search boundaries', ['binary search']), // a core pack is never part of the exam prep
]

describe('capgToday', () => {
  it('groups a day’s packs by role and ignores everything else', () => {
    const t = capgToday(packs, undefined, '2026-10-10') // day 4
    expect(t.window).toBe('ACTIVE')
    expect(t.day).toBe(4)
    expect(t.lessons.map((p) => p.title)).toEqual(['Recursion'])
    expect(t.drills.map((p) => p.title)).toEqual(['Drill · Recursion'])
    expect(t.practice.map((p) => p.title)).toEqual(['Code · Fibonacci'])
  })
  it('a revision day brings the drill back', () => {
    expect(capgToday(packs, undefined, '2026-10-13').drills.map((p) => p.title)).toEqual(['Drill · Recursion']) // day 7
  })
  it('before day 1 and after day 60 nothing is scheduled — no invented work', () => {
    expect(capgToday(packs, undefined, '2026-10-06')).toMatchObject({ window: 'BEFORE', lessons: [], drills: [], practice: [] })
    expect(capgToday(packs, undefined, '2026-12-06')).toMatchObject({ window: 'AFTER', lessons: [], drills: [], practice: [] })
  })
  it('counts days to the exam, zero on the day itself, null once it has passed or when there is none', () => {
    const exam = { date: '2026-12-07', userModified: false }
    expect(capgToday([], exam, '2026-10-07').daysToExam).toBe(61)
    expect(capgToday([], exam, '2026-12-07').daysToExam).toBe(0)
    expect(capgToday([], exam, '2026-12-08').daysToExam).toBeNull()
    expect(capgToday([], undefined, '2026-10-07').daysToExam).toBeNull()
  })
  it('the exam date counts as unconfirmed until the user has edited it', () => {
    expect(capgToday([], { date: '2026-12-07', userModified: false }, '2026-10-07').examUnconfirmed).toBe(true)
    expect(capgToday([], { date: '2026-12-14', userModified: true }, '2026-10-07').examUnconfirmed).toBe(false)
    expect(capgToday([], undefined, '2026-10-07').examUnconfirmed).toBe(false)
  })
  it('skips deleted packs', () => {
    const gone = { ...P('Recursion', ['capgemini', 'cg-lesson', 'cg-d4']), deletedAt: '2026-10-08T00:00:00.000Z' }
    expect(capgToday([gone], undefined, '2026-10-10').lessons).toEqual([])
  })
})
