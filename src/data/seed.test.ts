import { describe, expect, it } from 'vitest'
import { db } from './db'
import type { DailyQuoteRow } from './types'
import { SEED_VERSION, buildSeedRows, ensureSeeded } from './seed'
import { patchRow, softDelete } from './rows'
import { freshDbPerTest } from '@/test/db'
import { dsaTargetTotal } from '@/domain/progress'
import { addDays, dayOfWeek } from '@/domain/dates'
import { isOpportunity, groupOpportunities } from '@/domain/opportunities'
import { phaseForWeek } from '@/domain/weeks'
import { validatePackObject } from '@/lib/packSchema'
import { CARD_TYPES } from '@/lib/enums'
import { CAVEAT_GITHUB, CAVEAT_IT_SERVICES, CAVEAT_QUANT, CAVEAT_SUMMER_2027 } from '@/seed/events'
import { PACKS } from '@/seed/packs'
import { QUOTES } from '@/seed/quotes'
import { PORTALS } from '@/seed/portals'

freshDbPerTest()

describe('seed content (the bundle itself)', () => {
  const rows = buildSeedRows()

  it('18 weeks; DSA total is 363 (303 new W1–14 + 60 revision W15–18) — derived by SUM', () => {
    expect(rows.weeklyTargets).toHaveLength(18)
    expect(dsaTargetTotal(rows.weeklyTargets)).toBe(363)
    const first14 = rows.weeklyTargets.filter((w) => w.weekNumber <= 14)
    expect(dsaTargetTotal(first14)).toBe(303)
    expect(dsaTargetTotal(rows.weeklyTargets.filter((w) => w.weekNumber > 14))).toBe(60)
  })
  it('week boundaries are contiguous Mon–Sun and end on the plan end date', () => {
    const w = [...rows.weeklyTargets].sort((a, b) => a.weekNumber - b.weekNumber)
    w.forEach((x, i) => {
      expect(dayOfWeek(x.startDate)).toBe(1)
      expect(dayOfWeek(x.endDate)).toBe(0)
      if (i > 0) expect(x.startDate).toBe(addDays(w[i - 1]!.endDate, 1))
      expect(x.phase).toBe(phaseForWeek(x.weekNumber))
    })
    expect(w[0]!.startDate).toBe('2026-07-13')
    expect(w[17]!.endDate).toBe('2026-11-15')
  })
  it('targets per phase', () => {
    const by = (n: number) => rows.weeklyTargets.find((x) => x.weekNumber === n)!
    expect([by(1).dsaTarget, by(1).applicationTarget]).toEqual([3, 0])
    expect([by(2).dsaTarget, by(2).applicationTarget]).toEqual([25, 0])
    expect([by(3).dsaTarget, by(3).applicationTarget]).toEqual([27, 2])
    expect([by(4).dsaTarget, by(4).applicationTarget]).toEqual([28, 3])
    for (const n of [5, 6, 7, 8, 9]) expect([by(n).dsaTarget, by(n).applicationTarget]).toEqual([20, 5])
    for (const n of [10, 11, 12, 13, 14]) expect([by(n).dsaTarget, by(n).applicationTarget]).toEqual([24, 10])
    for (const n of [15, 16, 17, 18]) expect([by(n).dsaTarget, by(n).applicationTarget]).toEqual([15, 10])
  })
  it('seeds ~45 opportunities spanning Jul 2026 – Mar 2027, all with a fit pill', () => {
    const opps = rows.events.filter(isOpportunity)
    expect(opps.length).toBeGreaterThanOrEqual(40)
    expect(opps.length).toBeLessThanOrEqual(50)
    const dates = opps.map((e) => e.date).sort()
    expect(dates[0]!.slice(0, 7)).toBe('2026-07')
    expect(dates.at(-1)!.slice(0, 7)).toBe('2027-03')
    expect(new Set(opps.map((e) => e.date.slice(0, 7))).size).toBeGreaterThanOrEqual(9)
  })
  it('caveats are carried VERBATIM', () => {
    expect(CAVEAT_GITHUB).toBe('US/Canada/Remote only — useful for the Remote listings, not for India.')
    expect(CAVEAT_SUMMER_2027).toBe('Not your target — you graduate mid-2027 and most require returning to school.')
    expect(CAVEAT_QUANT).toBe('~90% of Indian quant hires come from IIT-B/D/K and ISI. WorldQuant Alphathon is the one door with no college filter.')
    expect(CAVEAT_IT_SERVICES).toBe('Aptitude game, not engineering. Your floor, not your ceiling. One Saturday.')
    const used = new Set(rows.events.map((e) => e.caveat).filter(Boolean))
    for (const c of [CAVEAT_GITHUB, CAVEAT_SUMMER_2027, CAVEAT_QUANT, CAVEAT_IT_SERVICES]) expect(used.has(c)).toBe(true)
  })
  it('quant firms are LONGSHOT; IT-services drives are MAYBE', () => {
    const byCaveat = (c: string) => rows.events.filter((e) => e.caveat === c)
    expect(byCaveat(CAVEAT_QUANT).some((e) => e.fitPill === 'LONGSHOT')).toBe(true)
    expect(byCaveat(CAVEAT_IT_SERVICES).every((e) => e.fitPill === 'MAYBE')).toBe(true)
    expect(byCaveat(CAVEAT_SUMMER_2027).every((e) => e.fitPill === 'LONGSHOT')).toBe(true)
  })
  it('the milestones the plan hinges on exist and are HARD', () => {
    const hard = new Map(rows.events.filter((e) => e.criticality === 'HARD').map((e) => [e.title, e]))
    expect(hard.get('Mimora deploy done')!.date).toBe('2026-08-02')
    expect(hard.get('RESUME + GITHUB + PORTFOLIO SHIPPED')!.date).toBe('2026-08-15')
    expect(hard.get('GenAI flagship shipped')!.date).toBe('2026-11-01')
    expect(hard.get('Plan ends — write the retrospective')!.date).toBe('2026-11-15')
    const google = rows.events.find((e) => e.title.startsWith('Google'))!
    expect(google.criticality).toBe('HARD')
    expect((google.notes ?? '') + google.title).toMatch(/2–4 weeks|SHORT/i)
  })
  it('the real grouping works on the real data (shared caveats surface once per month)', () => {
    const sections = groupOpportunities(rows.events, '2026-01-01')
    const shared = sections.flatMap((s) => s.groups.filter((g) => g.sharedCaveat))
    expect(shared.length).toBeGreaterThan(3)
  })
  it('12 packs, each the 8-beat shape, and every pack passes the SHARED validator', () => {
    expect(rows.invalid).toEqual([])
    expect(PACKS).toHaveLength(12)
    for (const p of PACKS) {
      expect(p.cards.map((c) => c.type), p.key).toEqual([...CARD_TYPES])
      const v = validatePackObject({ title: p.title, summary: p.summary, cards: p.cards })
      expect(v.ok, `${p.key}: ${v.ok ? '' : v.errors.join(',')}`).toBe(true)
    }
    expect(rows.contentCards).toHaveLength(96)
  })
  it('pack tags overlap the topics of the weeks they belong to', () => {
    for (const p of PACKS) {
      const w = rows.weeklyTargets.find((x) => x.weekNumber === p.weekNumber)!
      expect(p.tags.some((t) => w.topics.includes(t)), p.key).toBe(true)
    }
  })
  it('~30 quotes; unsure attributions are omitted rather than invented', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length)
    expect(QUOTES.some((q) => !q.author)).toBe(true) // proverbs carry a source, not a made-up author
    expect(QUOTES.every((q) => q.source.length > 0)).toBe(true)
    // the famous misattribution is credited to its verified source
    const habit = QUOTES.find((q) => q.text.startsWith('We are what we repeatedly do'))!
    expect(habit.author).toBe('Will Durant')
  })
  it('12 portals each with category, fit and caveat', () => {
    expect(PORTALS).toHaveLength(12)
    for (const p of PORTALS) expect(p.category && p.fitPill && p.caveat && p.url.startsWith('https://')).toBeTruthy()
  })
  it('ids are deterministic and unique across all seeded tables', () => {
    const again = buildSeedRows()
    expect(again.events.map((e) => e.id)).toEqual(rows.events.map((e) => e.id))
    const all = [...rows.weeklyTargets, ...rows.deliverables, ...rows.events, ...rows.dailyQuotes, ...rows.portals, ...rows.contentPacks, ...rows.contentCards].map((r) => r.id)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('ensureSeeded (idempotent, user-safe)', () => {
  it('seeds a fresh database with no network and no account, and never touches the sync queue', async () => {
    const r = await ensureSeeded()
    expect(r.ran).toBe(true)
    expect(r.invalidPacks).toEqual([])
    expect(await db.weeklyTargets.count()).toBe(18)
    expect(await db.contentPacks.count()).toBe(12)
    expect(await db.syncQueue.count()).toBe(0)
  })
  it('is idempotent — a second run is a no-op, and a forced one changes nothing', async () => {
    await ensureSeeded()
    const before = await db.events.toArray()
    expect((await ensureSeeded()).ran).toBe(false)
    const forced = await ensureSeeded(true)
    expect(forced.inserted).toBe(0)
    expect(await db.events.toArray()).toEqual(before)
    expect(await db.events.count()).toBe(before.length)
  })
  it('records the version', async () => {
    await ensureSeeded()
    expect((await db.syncMeta.get('seedVersion'))!.value).toBe(SEED_VERSION)
  })
  it('a re-seed NEVER overwrites a user-edited seed row, but refreshes untouched ones', async () => {
    await ensureSeeded()
    const deepA = (await db.events.toArray()).find((e) => e.title === 'Deep A — DSA')!
    await patchRow('events', deepA.id, { startTime: '05:00' })
    const untouched = (await db.events.toArray()).find((e) => e.title === 'Deep B — core / design')!
    await db.events.put({ ...untouched, notes: 'stale text from an older bundle' }) // simulate old seed content
    const r = await ensureSeeded(true)
    expect((await db.events.get(deepA.id))!.startTime).toBe('05:00')
    expect((await db.events.get(untouched.id))!.notes).not.toBe('stale text from an older bundle')
    expect(r.keptUserModified).toBeGreaterThanOrEqual(1)
  })
  it('a seeded row the user deleted stays deleted after a re-seed', async () => {
    await ensureSeeded()
    const victim = (await db.events.toArray()).find((e) => e.fitPill === 'LONGSHOT')!
    await softDelete('events', victim.id)
    await ensureSeeded(true)
    expect((await db.events.get(victim.id))!.deletedAt).not.toBeNull()
  })
  it('a ticked deliverable survives a re-seed', async () => {
    await ensureSeeded()
    const d = (await db.deliverables.toArray())[0]!
    await patchRow('deliverables', d.id, { done: true })
    await ensureSeeded(true)
    expect((await db.deliverables.get(d.id))!.done).toBe(true)
  })
  it('removes untouched seeded rows that left the bundle, keeps user-modified ones', async () => {
    await ensureSeeded()
    const [a, b] = (await db.dailyQuotes.toArray()) as [DailyQuoteRow, DailyQuoteRow]
    await db.dailyQuotes.put({ ...a, id: 'ghost-1', seeded: true, userModified: false })
    await db.dailyQuotes.put({ ...b, id: 'ghost-2', seeded: true, userModified: true })
    const r = await ensureSeeded(true)
    expect(r.removed).toBe(1)
    expect(await db.dailyQuotes.get('ghost-1')).toBeUndefined()
    expect(await db.dailyQuotes.get('ghost-2')).toBeDefined()
  })
  it('study blocks recur WEEKDAYS Mon–Fri across the whole plan from one row each (nothing materialised)', async () => {
    await ensureSeeded()
    const study = (await db.events.toArray()).filter((e) => e.type === 'STUDY_BLOCK')
    expect(study).toHaveLength(6)
    expect(study.filter((e) => e.recurrence === 'WEEKDAYS')).toHaveLength(3)
  })
})
