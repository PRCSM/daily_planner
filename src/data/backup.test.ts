import { describe, expect, it } from 'vitest'
import { db } from './db'
import { MAX_IMPORT_BYTES, buildExport, commitImport, eraseLocalData, exportFilename, findKeyShapedStrings, parseBackup, previewImport, tableCounts, validateRow } from './backup'
import { ensureSeeded } from './seed'
import { createEvent, removeEvent, updateEvent } from './repos/events'
import { ensureLog, patchLog } from './repos/logs'
import { createNote } from './repos/notes'
import { setSetting } from './repos/settings'
import { patchRow } from './rows'
import { addDsaProblem, addLogBlock } from '@/features/services/logging'
import { freshDbPerTest } from '@/test/db'
import { setClockSource, localDate } from '@/lib/clock'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'
import { SYNC_TABLES } from '@/lib/enums'

freshDbPerTest()

async function populate() {
  await ensureSeeded()
  await addLogBlock({ date: T0, track: 'DSA', minutes: 60, topic: 'two pointers', aiUsed: false })
  await addDsaProblem({ title: 'Two Sum', pattern: 'Hashing', difficulty: 'EASY', status: 'SOLVED_WITH_HINT', solvedDate: T0 })
  const log = (await db.dailyLogs.toArray())[0]!
  await patchLog(log.id, { shipped: 'the sheet', sleepHours: 6.5, fuelEntered: true })
  await createEvent({ title: 'Mock interview', type: 'CUSTOM', date: addDays(T0, 3), recurrence: 'NONE', criticality: 'HARD', sourceModule: 'CALENDAR' })
  const n = await createNote('Notes')
  const gone = await createEvent({ title: 'Deleted one', type: 'CUSTOM', date: T0, recurrence: 'NONE', criticality: 'INFO', sourceModule: 'CALENDAR' })
  await removeEvent(gone.id)
  const deepA = (await db.events.toArray()).find((e) => e.title === 'Deep A — DSA')!
  await patchRow('events', deepA.id, { startTime: '05:30' }) // an edited SEED row
  await setSetting('timetableLayout', { start: '09:00', length: 50, count: 6, days: [1, 2, 3, 4, 5] })
  return { noteId: n.id }
}

describe('export', () => {
  it('has the app marker, versions and only the user’s data: untouched seed rows are omitted, edited seed rows included', async () => {
    await populate()
    const f = await buildExport()
    expect(f).toMatchObject({ app: 'cadence', formatVersion: 1 })
    expect(f.tables.weeklyTargets).toBeUndefined() // 18 untouched seeded rows → reproducible, so not exported
    expect(f.tables.contentCards).toBeUndefined()
    const events = f.tables.events!
    expect(events.map((e) => e.title).sort()).toEqual(['Deep A — DSA', 'Deleted one', 'Mock interview'])
    expect(events.find((e) => e.title === 'Deep A — DSA')).toMatchObject({ startTime: '05:30', userModified: true })
  })
  it('includes soft-deleted rows (so the deletion survives a restore) and never the local sync bookkeeping', async () => {
    await populate()
    const f = await buildExport()
    expect(f.tables.events!.find((e) => e.title === 'Deleted one')!.deletedAt).not.toBeNull()
    const json = JSON.stringify(f)
    expect(json).not.toContain('syncedAt')
    expect(json).not.toContain('"attempts"')
    expect(f.tables).not.toHaveProperty('syncQueue')
    expect(f.tables).not.toHaveProperty('syncMeta')
  })
  it('contains NO key-shaped string — the app never stores a secret', async () => {
    await populate()
    expect(findKeyShapedStrings(JSON.stringify(await buildExport()))).toEqual([])
  })
  it('the detector DOES catch a key a user pasted into a note (planted) — and shows only a redacted hint', async () => {
    const { noteId } = await populate()
    const planted = 'gsk_' + 'Q'.repeat(40)
    const { updateBlock, getNote } = await import('./repos/notes')
    await updateBlock((await getNote(noteId)).blocks[0]!.id, { text: `my key ${planted} oops` })
    const hits = findKeyShapedStrings(JSON.stringify(await buildExport()))
    expect(hits).toHaveLength(1)
    expect(hits[0]!.kind).toBe('Groq-style key')
    expect(hits[0]!.hint).not.toContain(planted)
    expect(hits[0]!.hint).toMatch(/^gsk_…QQ \(44 chars\)$/)
  })
  it('recognises other token shapes', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.' + 'a'.repeat(30) + '.' + 'b'.repeat(20)
    const kinds = findKeyShapedStrings(`${jwt} ghp_${'x'.repeat(36)} AKIA${'A'.repeat(16)} sk-${'z'.repeat(30)} -----BEGIN RSA PRIVATE KEY-----`).map((h) => h.kind)
    expect(kinds.sort()).toEqual(['AWS access key id', 'GitHub token', 'JWT / access token', 'private key block', 'sk- style key'].sort())
    expect(findKeyShapedStrings('plain text, an ISO date 2026-08-03 and a uuid 20000000-0000-4000-8000-000000000001')).toEqual([])
  })
  it('names the file by local date', () => expect(exportFilename('2026-08-03')).toBe('cadence-backup-2026-08-03.json'))
})

describe('round trip: export → erase → import', () => {
  it('restores everything the user created, including soft deletes, and re-queues it for sync', async () => {
    await populate()
    const before = await buildExport()
    await eraseLocalData()
    expect(await db.logBlocks.count()).toBe(0)
    await ensureSeeded() // a fresh install seeds first, then the backup is merged over it
    const preview = await previewImport(JSON.stringify(before))
    expect(preview.ok).toBe(true)
    const result = await commitImport(preview)
    expect(result.skipped).toBe(0)
    const after = await buildExport()
    expect({ ...after, exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 })
    expect((await db.events.toArray()).find((e) => e.title === 'Deleted one')!.deletedAt).not.toBeNull()
    expect(await db.syncQueue.count()).toBeGreaterThan(5) // imported rows will sync to the cloud
    expect(await db.syncQueue.get(`events:${(await db.events.toArray()).find((e) => e.title === 'Deleted one')!.id}`)).toMatchObject({ op: 'delete' })
  })
  it('an edited seed row survives the restore and a later re-seed', async () => {
    await populate()
    const before = await buildExport()
    await eraseLocalData()
    await ensureSeeded()
    await commitImport(await previewImport(JSON.stringify(before)))
    await ensureSeeded(true)
    expect((await db.events.toArray()).find((e) => e.title === 'Deep A — DSA')!.startTime).toBe('05:30')
  })
})

describe('import: dry-run preview, merge by updatedAt', () => {
  it('previewing writes NOTHING', async () => {
    await populate()
    const file = JSON.stringify(await buildExport())
    await eraseLocalData()
    const preview = await previewImport(file)
    expect(preview.counts.logBlocks).toMatchObject({ incoming: 1, added: 1 })
    expect(await db.logBlocks.count()).toBe(0)
    expect(await db.syncQueue.count()).toBe(0)
  })
  it('counts added / updated / unchanged, and only newer rows are written (an OLDER backup never clobbers newer local edits)', async () => {
    await populate()
    const file = JSON.stringify(await buildExport()) // snapshot A
    const ev = (await db.events.toArray()).find((e) => e.title === 'Mock interview')!
    setClockSource(() => localDate(addDays(T0, 5), '09:00'))
    await updateEvent(ev.id, { title: 'Mock interview (moved)' }) // local is now NEWER than the backup
    const preview = await previewImport(file)
    expect(preview.counts.events).toMatchObject({ added: 0, updated: 0 })
    expect(preview.counts.events!.unchanged).toBe(3)
    await commitImport(preview)
    expect((await db.events.get(ev.id))!.title).toBe('Mock interview (moved)')
  })
  it('a NEWER backup row updates the local one', async () => {
    await populate()
    const ev = (await db.events.toArray()).find((e) => e.title === 'Mock interview')!
    const f = await buildExport()
    const row = f.tables.events!.find((e) => e.id === ev.id)!
    row.title = 'From another device'
    row.updatedAt = '2099-01-01T00:00:00.000Z'
    const preview = await previewImport(JSON.stringify(f))
    expect(preview.counts.events!.updated).toBe(1)
    await commitImport(preview)
    expect((await db.events.get(ev.id))!.title).toBe('From another device')
  })
  it('a unique-index collision (same date, different id) skips the row instead of aborting the import', async () => {
    await populate()
    const f = await buildExport()
    const log = f.tables.dailyLogs![0]!
    f.tables.dailyLogs = [{ ...log, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', updatedAt: '2099-01-01T00:00:00.000Z' }]
    const res = await commitImport(await previewImport(JSON.stringify(f)))
    expect(res.skipped).toBe(1)
    expect(await db.dailyLogs.count()).toBe(1)
  })
})

describe('import is a TRUST BOUNDARY', () => {
  const good = async () => {
    await populate()
    return buildExport()
  }
  it('rejects non-JSON, non-Cadence, newer-format, oversized and table-less files with a clear message', async () => {
    expect(parseBackup('nope')).toEqual({ ok: false, fatal: 'That isn’t valid JSON.' })
    expect((parseBackup('[]') as { fatal: string }).fatal).toMatch(/isn’t a Cadence backup/)
    expect((parseBackup('{"app":"other"}') as { fatal: string }).fatal).toMatch(/app marker/)
    expect((parseBackup('{"app":"cadence","formatVersion":99,"tables":{}}') as { fatal: string }).fatal).toMatch(/newer version/)
    expect((parseBackup('{"app":"cadence","formatVersion":1}') as { fatal: string }).fatal).toMatch(/no tables/)
    expect((parseBackup('x'.repeat(MAX_IMPORT_BYTES + 1)) as { fatal: string }).fatal).toMatch(/too large/)
    expect((await previewImport('nope')).ok).toBe(false)
  })
  it('validates every field: enums, dates, times, numbers, booleans, string lengths', async () => {
    const f = await good()
    const ev = f.tables.events![0]!
    const bad: Record<string, unknown>[] = [
      { ...ev, id: 'not-a-uuid' },
      { ...ev, updatedAt: 'yesterday' },
      { ...ev, type: 'HACK' },
      { ...ev, criticality: 'MEH' },
      { ...ev, date: '2026-13-45x' },
      { ...ev, startTime: '25:99' },
      { ...ev, done: 'yes' },
      { ...ev, title: 7 },
      { ...ev, title: 'x'.repeat(20_001) },
      { ...ev, weekNumber: Infinity },
      { ...ev, track: 'NOT_A_TRACK' },
    ]
    for (const [i, row] of bad.entries()) expect(validateRow('events', row), String(i)).toMatchObject({ ok: false })
    expect(validateRow('events', null)).toMatchObject({ ok: false })
    expect(validateRow('events', [])).toMatchObject({ ok: false })
    expect(validateRow('events', ev)).toMatchObject({ ok: true })
  })
  it('bad rows are reported with their table/index and skipped; good rows in the same file still import', async () => {
    const f = await good()
    f.tables.events!.push({ nope: true }, { ...f.tables.events![0]!, type: 'HACK', id: '30000000-0000-4000-8000-000000000001' })
    const preview = await previewImport(JSON.stringify(f))
    expect(preview.counts.events!.invalid).toBe(2)
    expect(preview.issues.filter((i) => i.table === 'events').map((i) => i.index)).toEqual([3, 4])
    expect(preview.ok).toBe(true)
  })
  it('strips UNKNOWN fields (whitelist), including prototype-pollution attempts', async () => {
    const f = await good()
    const polluted = JSON.parse(JSON.stringify(f.tables.events![0]!))
    polluted.isAdmin = true
    polluted.__proto__ = { polluted: true }
    polluted.constructor = 'x'
    const text = JSON.stringify({ ...f, tables: { events: [polluted] } }).replace('"isAdmin":true', '"isAdmin":true,"__proto__":{"polluted":true}')
    const preview = await previewImport(text)
    const row = preview.clean.events![0] ?? (await previewImport(JSON.stringify({ ...f, tables: { events: [{ ...polluted, updatedAt: '2099-01-01T00:00:00.000Z' }] } }))).clean.events![0]!
    expect(row).not.toHaveProperty('isAdmin')
    expect(row).not.toHaveProperty('polluted')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('unknown tables and non-list tables are ignored with a note; secrets-named settings are never imported', async () => {
    const f = await good()
    const text = JSON.stringify({ ...f, tables: { ...f.tables, users: [{ id: 1 }], notes: 'oops' } })
    const preview = await previewImport(text)
    expect(preview.issues.map((i) => i.message)).toEqual(expect.arrayContaining(['unknown table — ignored', 'not a list — ignored']))
    const setting = { id: '40000000-0000-4000-8000-000000000001', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, key: 'groqApiKey', value: 'x' }
    expect(validateRow('appSettings', setting)).toMatchObject({ ok: false, message: expect.stringMatching(/secrets/) })
    expect(validateRow('appSettings', { ...setting, key: 'timetableLayout' })).toMatchObject({ ok: true })
  })
  it('refuses absurd row counts', async () => {
    const rows = Array.from({ length: 200_001 }, () => 1)
    expect((await previewImport(JSON.stringify({ app: 'cadence', formatVersion: 1, tables: { events: rows } }))).fatal).toMatch(/Too many rows/)
  })
  it('tri-state q5FuelOk survives: null stays null (unanswered), never becomes false', async () => {
    const { saveReview } = await import('./repos/plan')
    await saveReview(3, { q5FuelOk: null, q1Dsa: 'x' })
    await saveReview(4, { q5FuelOk: false })
    const f = await buildExport()
    await eraseLocalData()
    await commitImport(await previewImport(JSON.stringify(f)))
    const r = (await db.weeklyReviews.toArray()).sort((a, b) => a.weekNumber - b.weekNumber)
    expect(r.map((x) => x.q5FuelOk)).toEqual([null, false])
  })
})

describe('diagnostics helpers', () => {
  it('table counts show live vs total (soft-deleted rows counted separately)', async () => {
    await populate()
    const counts = await tableCounts()
    expect(counts.map((c) => c.table).sort()).toEqual([...SYNC_TABLES].sort())
    const events = counts.find((c) => c.table === 'events')!
    expect(events.total - events.live).toBe(1)
    expect(await ensureLog(T0, { weekNumber: 4, phase: 'GET_PRESENTABLE' })).toBeTruthy()
  })
})
