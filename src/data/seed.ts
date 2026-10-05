import type { Table } from 'dexie'
import type { SyncTable } from '@/lib/enums'
import { detId } from '@/lib/ids'
import { validatePackObject } from '@/lib/packSchema'
import { ALL_EVENT_SEEDS } from '@/seed/events'
import { PACKS } from '@/seed/packs'
import { PORTALS } from '@/seed/portals'
import { QUOTES } from '@/seed/quotes'
import { SEED_STAMP, addDaysStr } from '@/seed/util'
import { DELIVERABLES, WEEKS, weekEnd, weekStart } from '@/seed/weeks'
import { db } from './db'
import type { ContentCardRow, ContentPackRow, DailyQuoteRow, DeliverableRow, EventRow, PortalRow, TableRowMap, WeeklyTargetRow } from './types'

/**
 * Bump when seed CONTENT changes. Re-seeding touches only rows where seeded=true AND userModified=false,
 * so a user's edits (a moved study block, a ticked deliverable, a deleted opportunity) are never overwritten.
 * Idempotent: running twice is the same as running once.
 */
export const SEED_VERSION = 2 // v2: dropped the per-row "typical window" note (shown once on the Opportunities screen instead)
const META_KEY = 'seedVersion'

const stamps = { createdAt: SEED_STAMP, updatedAt: SEED_STAMP, deletedAt: null, syncedAt: null }
const flags = { seeded: true, userModified: false }

export function buildSeedRows() {
  const weeklyTargets: WeeklyTargetRow[] = WEEKS.map((w) => ({
    id: detId('seed:week', w.weekNumber), ...stamps, ...flags,
    weekNumber: w.weekNumber, startDate: weekStart(w.weekNumber), endDate: weekEnd(w.weekNumber), phase: w.phase, theme: w.theme,
    dsaTarget: w.dsaTarget, applicationTarget: w.applicationTarget, topics: w.topics,
  }))

  const perWeek = new Map<number, number>()
  const deliverables: DeliverableRow[] = DELIVERABLES.map((d) => {
    const i = perWeek.get(d.weekNumber) ?? 0
    perWeek.set(d.weekNumber, i + 1)
    return { id: detId('seed:deliverable', d.weekNumber, i), ...stamps, ...flags, weekNumber: d.weekNumber, text: d.text, done: false, dueDate: d.dueDate ?? addDaysStr(weekEnd(d.weekNumber), 0) }
  })

  const events: EventRow[] = ALL_EVENT_SEEDS.map(({ key, ...e }) => ({ id: detId('seed:event', key), ...stamps, ...flags, done: false, ...e }))

  const dailyQuotes: DailyQuoteRow[] = QUOTES.map((q) => ({
    id: detId('seed:quote', q.key), ...stamps, ...flags, text: q.text, author: q.author, source: q.source, category: q.category, saved: false,
  }))

  const portals: PortalRow[] = PORTALS.map((p) => ({ id: detId('seed:portal', p.key), ...stamps, ...flags, name: p.name, category: p.category, url: p.url, fitPill: p.fitPill, caveat: p.caveat }))

  const contentPacks: ContentPackRow[] = []
  const contentCards: ContentCardRow[] = []
  const invalid: string[] = []
  for (const p of PACKS) {
    // The SAME validator as AI-generated packs.
    const v = validatePackObject({ title: p.title, summary: p.summary, cards: p.cards })
    if (!v.ok) {
      invalid.push(`${p.key}: ${v.errors.join('; ')}`)
      continue
    }
    const packId = detId('seed:pack', p.key)
    const chars = v.pack.cards.reduce((n, card) => n + card.body.length + (card.codeSnippet?.length ?? 0), 0)
    contentPacks.push({
      id: packId, ...stamps, ...flags, title: v.pack.title, track: p.track, weekNumber: p.weekNumber, topic: p.topic, summary: v.pack.summary,
      tags: p.tags, source: 'SEEDED', totalCards: v.pack.cards.length, estimatedMinutes: Math.max(2, Math.round(chars / 900)),
    })
    for (const card of v.pack.cards) {
      contentCards.push({ id: detId('seed:card', p.key, card.orderIndex), ...stamps, ...flags, packId, orderIndex: card.orderIndex, type: card.type, heading: card.heading, body: card.body, codeSnippet: card.codeSnippet, codeLang: card.codeLang })
    }
  }
  return { weeklyTargets, deliverables, events, dailyQuotes, portals, contentPacks, contentCards, invalid }
}

export interface SeedReport {
  ran: boolean
  version: number
  inserted: number
  updated: number
  keptUserModified: number
  removed: number
  invalidPacks: string[]
}

type SeededRow = { id: string; seeded?: boolean; userModified?: boolean; deletedAt: string | null; createdAt: string }

async function syncTable<K extends SyncTable>(name: K, desired: TableRowMap[K][], report: SeedReport): Promise<void> {
  const table = db[name] as unknown as Table<TableRowMap[K] & SeededRow, string>
  const existing = (await table.toArray()).filter((r) => r.seeded === true)
  const byId = new Map(existing.map((r) => [r.id, r]))
  const want = new Set<string>()
  const toPut: (TableRowMap[K] & SeededRow)[] = []
  for (const row of desired as (TableRowMap[K] & SeededRow)[]) {
    want.add(row.id)
    const ex = byId.get(row.id)
    if (!ex) {
      toPut.push(row)
      report.inserted++
    } else if (ex.userModified === true || ex.deletedAt) {
      report.keptUserModified++ // never overwritten
    } else {
      toPut.push({ ...row, createdAt: ex.createdAt })
      report.updated++
    }
  }
  if (toPut.length) await table.bulkPut(toPut)
  // Seeded + untouched rows that left the bundle go away (they were never synced, so a hard delete is safe).
  const stale = existing.filter((r) => !want.has(r.id) && r.userModified !== true).map((r) => r.id)
  if (stale.length) {
    await table.bulkDelete(stale)
    report.removed += stale.length
  }
}

export async function ensureSeeded(force = false): Promise<SeedReport> {
  const current = ((await db.syncMeta.get(META_KEY))?.value as number | undefined) ?? 0
  const report: SeedReport = { ran: false, version: SEED_VERSION, inserted: 0, updated: 0, keptUserModified: 0, removed: 0, invalidPacks: [] }
  if (!force && current >= SEED_VERSION) return report
  const rows = buildSeedRows()
  report.invalidPacks = rows.invalid
  await db.transaction('rw', [db.weeklyTargets, db.deliverables, db.events, db.dailyQuotes, db.portals, db.contentPacks, db.contentCards, db.syncMeta], async () => {
    await syncTable('weeklyTargets', rows.weeklyTargets, report)
    await syncTable('deliverables', rows.deliverables, report)
    await syncTable('events', rows.events, report)
    await syncTable('dailyQuotes', rows.dailyQuotes, report)
    await syncTable('portals', rows.portals, report)
    await syncTable('contentPacks', rows.contentPacks, report)
    await syncTable('contentCards', rows.contentCards, report)
    await db.syncMeta.put({ key: META_KEY, value: SEED_VERSION })
  })
  report.ran = true
  return report
}
