import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { patchRow } from '@/data/rows'
import { freshDbPerTest } from '@/test/db'
import { splitCheck } from '@/domain/markdown'
import { validatePackObject } from '@/lib/packSchema'
import { CAPG_DAYS, CAPG_DAY_ONE, CAPG_EXAM_DEFAULT, CAPG_KINDS, CAPG_TAG, capgDayNumber, capgDayTag, capgKindOf, isCapgTags } from '@/lib/capgemini'
import { findKeyShapedStrings } from '@/data/backup'
import { PLAN_BEGIN, PLAN_START } from '../util'
import { type CapgContent, buildCapgeminiRows, capgDate, loadCapgemini } from '.'

freshDbPerTest()

let content: CapgContent
beforeAll(async () => {
  content = await loadCapgemini()
})

describe('Capgemini prep content (converted from the standalone prep page)', () => {
  it('has the expected inventory: 61 lessons + the exam overview, MCQ drills, coding, debugging, interview, prompt and English packs', () => {
    const by = (k: string) => content.packs.filter((p) => p.kind === k).length
    expect(by('lesson')).toBe(62) // 61 lessons + "the exam at a glance"
    expect(by('coding')).toBe(22)
    expect(by('debug')).toBe(22)
    expect(by('prompt')).toBe(12) // 8 prompt-lab tasks + 4 AI-assisted-coding simulations
    expect(by('interview')).toBeGreaterThanOrEqual(12)
    expect(by('english')).toBe(12)
    // every one of the 423 source questions is present exactly once
    const questions = content.packs.filter((p) => p.kind === 'drill').flatMap((p) => p.cards.filter((c) => c.type === 'CHECK'))
    expect(questions).toHaveLength(423)
  })

  it('every pack passes the SAME validator as AI-generated and core packs', () => {
    const rows = buildCapgeminiRows(content)
    expect(rows.invalid).toEqual([])
    expect(rows.contentPacks).toHaveLength(content.packs.length)
    expect(rows.contentCards).toHaveLength(content.counts.cards)
    for (const p of content.packs) {
      const v = validatePackObject({ title: p.title, summary: p.summary, cards: p.cards.map((c, i) => ({ orderIndex: i, ...c })) })
      expect(v.ok, `${p.key}: ${v.ok ? '' : v.errors.join('; ')}`).toBe(true)
    }
  })

  it('keys are unique and every kind is a known kind', () => {
    expect(new Set(content.packs.map((p) => p.key)).size).toBe(content.packs.length)
    for (const p of content.packs) expect(CAPG_KINDS, p.key).toContain(p.kind)
  })

  it('every CHECK card splits into a question and an answer, and MCQ answers name a real option', () => {
    for (const p of content.packs) {
      for (const c of p.cards.filter((x) => x.type === 'CHECK')) {
        const { question, answer } = splitCheck(c.body)
        expect(question.length, `${p.key} question`).toBeGreaterThan(5)
        expect(answer?.length ?? 0, `${p.key} answer`).toBeGreaterThan(3)
      }
    }
    const mcq = content.packs.find((p) => p.key === 'cg-drill-t4')!.cards.find((c) => c.type === 'CHECK')!
    const { question, answer } = splitCheck(mcq.body)
    expect(question).toMatch(/- A\) /)
    expect(answer).toMatch(/^\*\*B\) 1 2 3\*\*/)
  })

  it('carries no HTML, no links, no leftover extraction markers and nothing key-shaped', () => {
    for (const p of content.packs) {
      for (const c of p.cards) {
        const prose = c.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
        expect(prose, `${p.key}`).not.toMatch(/@@CODE|&amp;|&lt;|&gt;|<\/?(?:b|i|p|div|table|tr|td|th|ul|li|br|pre)\s*\/?>/i)
        expect(c.body, `${p.key}`).not.toMatch(/https?:\/\//)
      }
    }
    expect(findKeyShapedStrings(JSON.stringify(content))).toEqual([])
  })

  it('does not point the reader at tabs or screens of the original page that do not exist here', () => {
    const text = content.packs.flatMap((p) => p.cards.map((c) => c.body)).join('\n') + content.days.flatMap((d) => d.practice.map((x) => x.text)).join('\n')
    expect(text).not.toMatch(/\b(Practice|Games|Today|Interview|Progress|Mocks?) tab\b|Progress →|#\/(?:lesson|day|cp)/)
  })

  it('the source is credited as candidate-reported, not official', () => {
    const overview = content.packs.find((p) => p.key === 'cg-pattern')!
    expect(overview.cards.map((c) => c.body).join(' ')).toMatch(/hasn't published it officially/)
  })
})

describe('the 60-day schedule', () => {
  it('has 60 days in order, each referring only to packs that exist, and every pack is scheduled somewhere', () => {
    expect(content.days.map((d) => d.n)).toEqual(Array.from({ length: CAPG_DAYS }, (_, i) => i + 1))
    const keys = new Set(content.packs.map((p) => p.key))
    for (const d of content.days) {
      for (const k of [...d.lessons, ...d.drills, ...d.practice.flatMap((x) => (x.pack ? [x.pack] : []))]) expect(keys.has(k), `day ${d.n} → ${k}`).toBe(true)
    }
    expect(content.packs.filter((p) => !p.days.length).map((p) => p.key)).toEqual([])
  })

  it('day 1 is today’s start of the plan, and day 60 lands before the exam with spare days', () => {
    expect(CAPG_DAY_ONE).toBe(PLAN_BEGIN)
    expect(capgDate(1)).toBe('2026-10-07')
    expect(capgDate(CAPG_DAYS)).toBe('2026-12-05')
    expect(capgDate(CAPG_DAYS) < CAPG_EXAM_DEFAULT).toBe(true)
    expect(capgDayNumber('2026-10-07')).toBe(1)
    expect(capgDayNumber('2026-10-06')).toBe(0)
    expect(capgDayNumber('2026-12-05')).toBe(60)
  })

  it('becomes one block per day on the right dates, evenings on weekdays and afternoons on weekends, all inside the plan', () => {
    const { events } = buildCapgeminiRows(content)
    const days = events.filter((e) => e.type === 'STUDY_BLOCK').sort((a, b) => a.date.localeCompare(b.date))
    expect(days).toHaveLength(60)
    expect(days[0]!.date).toBe('2026-10-07')
    for (const [i, e] of days.entries()) {
      expect(e.date).toBe(capgDate(i + 1))
      const dow = new Date(`${e.date}T00:00:00Z`).getUTCDay()
      expect([e.startTime, e.endTime], e.date).toEqual(dow === 0 || dow === 6 ? ['15:00', '17:00'] : ['17:30', '19:00'])
      expect(e.weekNumber, e.date).toBeGreaterThanOrEqual(1)
      expect(e.weekNumber, e.date).toBeLessThanOrEqual(18)
      expect((e.notes ?? '').length, e.date).toBeLessThan(1800)
      expect(e.date >= PLAN_START).toBe(true)
    }
    // the block doesn't collide with the existing daily rhythm (06:30–08:30, 19:00–22:00 weekdays)
    expect(days.filter((e) => e.endTime! > '19:00' && e.startTime! < '22:00' && !['15:00'].includes(e.startTime!))).toEqual([])
  })

  it('adds a HARD exam milestone that says plainly the date is a placeholder to confirm', () => {
    const { events } = buildCapgeminiRows(content)
    const exam = events.find((e) => e.type === 'MILESTONE')!
    expect(exam.criticality).toBe('HARD')
    expect(exam.date).toBe(CAPG_EXAM_DEFAULT)
    expect(exam.title).toMatch(/confirm/i)
    expect(exam.caveat).toMatch(/Placeholder/)
  })

  it('tags packs so the Learn screen can find a day’s work', () => {
    const { contentPacks } = buildCapgeminiRows(content)
    const lesson = contentPacks.find((p) => p.title === 'Recursion & the call stack')!
    expect(isCapgTags(lesson.tags)).toBe(true)
    expect(lesson.tags).toContain(CAPG_TAG)
    expect(capgKindOf(lesson.tags)).toBe('lesson')
    expect(lesson.tags).toContain(capgDayTag(4))
    expect(lesson.weekNumber).toBe(1) // 10 Oct is in plan week 1
  })

  it('blends with the base plan: the daily rhythm blocks are untouched and the two do not share a time slot', async () => {
    await ensureSeeded()
    const rec = (await db.events.toArray()).filter((e) => e.type === 'STUDY_BLOCK' && e.recurrence !== 'NONE')
    expect(rec.map((e) => e.title).sort()).toEqual(['Block C — apply · write · ship', 'Deep A — DSA', 'Deep B — core / design', 'Sunday review', 'Weekend DSA + revision', 'Weekend build'])
  })
})

describe('seeding the Capgemini content', () => {
  it('writes packs, cards and day blocks in one go, with no sync traffic, and a second run changes nothing', async () => {
    const r = await ensureSeeded()
    expect(r.invalidPacks).toEqual([])
    expect(await db.contentPacks.filter((p) => p.topic === CAPG_TAG).count()).toBe(content.packs.length)
    expect(await db.contentCards.count()).toBe(96 + content.counts.cards)
    expect(await db.events.filter((e) => e.title.startsWith('Capgemini · day')).count()).toBe(60)
    expect(await db.syncQueue.count()).toBe(0)
    const before = await db.contentCards.count()
    expect((await ensureSeeded(true)).inserted).toBe(0)
    expect(await db.contentCards.count()).toBe(before)
  })

  it('an edit to the exam date (the user confirming it) survives every later re-seed', async () => {
    await ensureSeeded()
    const exam = (await db.events.toArray()).find((e) => e.title.startsWith('Capgemini exam'))!
    await patchRow('events', exam.id, { date: '2026-12-14', title: 'Capgemini exam' })
    await ensureSeeded(true)
    const after = (await db.events.get(exam.id))!
    expect([after.date, after.title]).toEqual(['2026-12-14', 'Capgemini exam'])
  })
})
