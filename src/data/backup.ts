import type { Table } from 'dexie'
import {
  APPLICATION_STATUSES, APPLICATION_TYPES, BLOCK_TYPES, CARD_TYPES, CHAT_CONTEXTS, CHAT_ROLES, CRITICALITIES, DIFFICULTIES, DSA_STATUSES, EVENT_TYPES, FIT_PILLS, NOTE_BLOCK_TYPES, NOTE_LINK_TYPES,
  OCCURRENCE_STATUSES, PACK_SOURCES, PHASES, PRIORITIES, RECURRENCES, SLOT_KINDS, SOURCE_MODULES, SYNC_TABLES, TASK_STATUSES, TRACKS, type SyncTable,
} from '@/lib/enums'
import { readClock } from '@/lib/clock'
import { db, SCHEMA_VERSION } from './db'

export { SCHEMA_VERSION }
import { stamp } from './rows'
import type { SyncQueueRow } from './types'

/**
 * Export / import of the whole history as JSON.
 *
 * EXPORT contains the full history (logs, applications, notes, sleep…) — the UI warns before saving it, and
 * `findKeyShapedStrings` flags anything that looks like an API key / token that a user pasted into a note.
 * No secret is ever stored by the app itself (the Groq key lives only in the Edge Function).
 *
 * IMPORT is a trust boundary: the file is size-capped, version-checked, and EVERY row is validated against a
 * per-table whitelist. Unknown fields are dropped, bad rows are reported and skipped, and nothing is written
 * until the user has seen the preview.
 */
export const FORMAT_VERSION = 1
export const MAX_IMPORT_BYTES = 25_000_000
export const MAX_IMPORT_ROWS = 200_000

export interface BackupFile {
  app: 'cadence'
  formatVersion: number
  schemaVersion: number
  exportedAt: string
  tables: Partial<Record<SyncTable, Record<string, unknown>[]>>
}

/* ───────────── Row schemas ───────────── */
type Rule = 'str' | 'str?' | 'num' | 'num?' | 'bool' | 'bool?' | 'boolnull' | 'date' | 'date?' | 'time?' | 'strs' | 'any' | readonly string[] | { optEnum: readonly string[] }
const E = <T extends readonly string[]>(v: T): readonly string[] => v

const SCHEMAS: Record<SyncTable, Record<string, Rule>> = {
  events: { title: 'str', type: E(EVENT_TYPES), date: 'date', endDate: 'date?', startTime: 'time?', endTime: 'time?', track: { optEnum: TRACKS }, weekNumber: 'num?', criticality: E(CRITICALITIES), recurrence: E(RECURRENCES), sourceModule: E(SOURCE_MODULES), linkUrl: 'str?', fitPill: { optEnum: FIT_PILLS }, caveat: 'str?', notes: 'str?', done: 'bool', seeded: 'bool', userModified: 'bool' },
  eventOccurrences: { eventId: 'str', occurrenceDate: 'date', status: E(OCCURRENCE_STATUSES), completedAt: 'str?', movedToDate: 'date?', overrideTitle: 'str?', overrideStartTime: 'time?', overrideEndTime: 'time?', overrideNotes: 'str?' },
  dailyLogs: { date: 'date', weekNumber: 'num', phase: E(PHASES), shipped: 'str?', blockers: 'str?', applicationsSent: 'num', conceptsLearned: 'strs', sleepHours: 'num?', trained: 'bool', aiOffRespected: 'bool', energy: 'num', notes: 'str?', fuelEntered: 'bool?' },
  logBlocks: { logId: 'str', date: 'date', blockType: E(BLOCK_TYPES), track: E(TRACKS), minutes: 'num', topic: 'str?', aiUsed: 'bool', notes: 'str?' },
  dsaProblems: { title: 'str', source: 'str', url: 'str?', pattern: 'str', difficulty: E(DIFFICULTIES), status: E(DSA_STATUSES), timeMinutes: 'num?', solvedDate: 'date', reviewDue: 'date?', reviewCount: 'num', lastReviewedDate: 'date?' },
  applications: { company: 'str', role: 'str', type: E(APPLICATION_TYPES), url: 'str?', source: 'str?', status: E(APPLICATION_STATUSES), appliedDate: 'date?', nextFollowUp: 'date?', followUpEventId: 'str?', resumeVariant: 'str?', eventId: 'str?', notes: 'str?' },
  weeklyTargets: { weekNumber: 'num', startDate: 'date', endDate: 'date', phase: E(PHASES), theme: 'str', dsaTarget: 'num', applicationTarget: 'num', topics: 'strs', seeded: 'bool', userModified: 'bool' },
  deliverables: { weekNumber: 'num', text: 'str', done: 'bool', dueDate: 'date?', seeded: 'bool', userModified: 'bool' },
  weeklyReviews: { weekNumber: 'num', q1Dsa: 'str?', q2Core: 'str?', q3Shipped: 'str?', q4Applications: 'str?', q5FuelOk: 'boolnull', burnoutFlag: 'bool' },
  timetableSlots: { title: 'str', dayOfWeek: 'num', startTime: 'time?', endTime: 'time?', location: 'str?', kind: E(SLOT_KINDS), sourceImport: 'str?', active: 'bool', eventId: 'str?' },
  plannerDays: { date: 'date', intention: 'str?' },
  plannerTasks: { dayId: 'str', title: 'str', startTime: 'time?', endTime: 'time?', linkedEventId: 'str?', priority: E(PRIORITIES), status: E(TASK_STATUSES), notes: 'str?', orderIndex: 'num', track: { optEnum: TRACKS } },
  dailyQuotes: { date: 'date?', text: 'str', author: 'str?', source: 'str', category: 'str?', saved: 'bool', seeded: 'bool', userModified: 'bool' },
  contentPacks: { title: 'str', track: { optEnum: TRACKS }, weekNumber: 'num?', topic: 'str', summary: 'str', tags: 'strs', source: E(PACK_SOURCES), totalCards: 'num', estimatedMinutes: 'num', seeded: 'bool', userModified: 'bool' },
  contentCards: { packId: 'str', orderIndex: 'num', type: E(CARD_TYPES), heading: 'str?', body: 'str', codeSnippet: 'str?', codeLang: 'str?', seeded: 'bool', userModified: 'bool' },
  packProgress: { packId: 'str', date: 'date', cardsViewed: 'num', cardsTotal: 'num', completed: 'bool', minutesSpent: 'num' },
  chatThreads: { title: 'str', contextType: E(CHAT_CONTEXTS), contextId: 'str?', contextExcerpt: 'str?' },
  chatMessages: { threadId: 'str', role: E(CHAT_ROLES), content: 'str' },
  notes: { title: 'str', linkType: E(NOTE_LINK_TYPES), linkId: 'str?' },
  noteBlocks: { noteId: 'str', type: E(NOTE_BLOCK_TYPES), text: 'str', checked: 'bool?', orderIndex: 'num' },
  appSettings: { key: 'str', value: 'any' },
  portals: { name: 'str', category: 'str', url: 'str', fitPill: E(FIT_PILLS), caveat: 'str?', seeded: 'bool', userModified: 'bool' },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const isoOk = (s: unknown): s is string => typeof s === 'string' && s.length <= 40 && !Number.isNaN(Date.parse(s))
const MAX_STR = 20_000
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_STR
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function check(v: unknown, rule: Rule): boolean {
  if (Array.isArray(rule)) return typeof v === 'string' && (rule as readonly string[]).includes(v)
  if (typeof rule === 'object') return v === undefined || (typeof v === 'string' && (rule as { optEnum: readonly string[] }).optEnum.includes(v))
  const optional = typeof rule === 'string' && rule.endsWith('?')
  if (optional && (v === undefined || v === null)) return true
  switch (typeof rule === 'string' ? rule.replace('?', '') : rule) {
    case 'str': return isStr(v)
    case 'num': return isNum(v)
    case 'bool': return typeof v === 'boolean'
    case 'boolnull': return v === null || typeof v === 'boolean'
    case 'date': return typeof v === 'string' && DATE.test(v)
    case 'time': return typeof v === 'string' && TIME.test(v)
    case 'strs': return Array.isArray(v) && v.length <= 200 && v.every(isStr)
    case 'any': return v === null || ['string', 'number', 'boolean', 'object'].includes(typeof v)
    default: return false
  }
}

export interface RowIssue {
  table: string
  index: number
  message: string
}

/** Validate ONE row. Returns a clean row (whitelisted fields only) or the reason it was rejected. */
export function validateRow(table: SyncTable, raw: unknown): { ok: true; row: Record<string, unknown> } | { ok: false; message: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, message: 'not an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !UUID.test(r.id)) return { ok: false, message: 'bad id' }
  if (!isoOk(r.createdAt) || !isoOk(r.updatedAt)) return { ok: false, message: 'bad timestamps' }
  if (r.deletedAt !== null && r.deletedAt !== undefined && !isoOk(r.deletedAt)) return { ok: false, message: 'bad deletedAt' }
  const out: Record<string, unknown> = { id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt ?? null, syncedAt: null }
  for (const [field, rule] of Object.entries(SCHEMAS[table])) {
    const v = r[field]
    if (!check(v, rule)) return { ok: false, message: `invalid “${field}”` }
    if (v !== undefined && v !== null) out[field] = v
    else if (v === null && rule === 'boolnull') out[field] = null
  }
  // appSettings can't be allowed to smuggle a secret back in.
  if (table === 'appSettings' && /key|token|secret|password/i.test(String(out.key))) return { ok: false, message: 'settings named like secrets are never imported' }
  return { ok: true, row: out }
}

/* ───────────── Export ───────────── */
const tableOf = (name: SyncTable) => (db as unknown as Record<string, Table<Record<string, unknown> & { id: string }, string>>)[name]!

export async function buildExport(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {}
  for (const name of SYNC_TABLES) {
    const rows = await tableOf(name).toArray()
    // Untouched seed rows are reproducible from the app bundle; everything the user made or changed is exported.
    const mine = rows.filter((r) => !(r.seeded === true && r.userModified !== true)).map(({ syncedAt: _s, ...rest }) => rest)
    if (mine.length) tables[name] = mine
  }
  return { app: 'cadence', formatVersion: FORMAT_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: readClock().iso, tables }
}

export const exportFilename = (date: string): string => `cadence-backup-${date}.json`

/**
 * Looks for strings that resemble API keys / bearer tokens (Groq, OpenAI-style, JWTs, AWS, GitHub). A user can paste
 * one into a note; the export would then carry it. Returns short, redacted hints — never the secret itself.
 */
const KEY_SHAPES: [RegExp, string][] = [
  [/\bgsk_[A-Za-z0-9]{16,}/g, 'Groq-style key'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, 'sk- style key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/g, 'JWT / access token'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'private key block'],
]
export function findKeyShapedStrings(json: string): { kind: string; hint: string }[] {
  const out: { kind: string; hint: string }[] = []
  for (const [re, kind] of KEY_SHAPES) {
    for (const m of json.matchAll(re)) out.push({ kind, hint: `${m[0].slice(0, 4)}…${m[0].slice(-2)} (${m[0].length} chars)` })
  }
  return out
}

/* ───────────── Import ───────────── */
export interface ImportPreview {
  ok: boolean
  fatal?: string
  counts: Partial<Record<SyncTable, { incoming: number; added: number; updated: number; unchanged: number; invalid: number }>>
  issues: RowIssue[]
  totalRows: number
  clean: Partial<Record<SyncTable, Record<string, unknown>[]>>
}

export function parseBackup(text: string): { ok: true; file: BackupFile } | { ok: false; fatal: string } {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, fatal: 'That file is too large to be a Cadence backup.' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, fatal: 'That isn’t valid JSON.' }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, fatal: 'That isn’t a Cadence backup.' }
  const f = data as Record<string, unknown>
  if (f.app !== 'cadence') return { ok: false, fatal: 'That isn’t a Cadence backup (missing the app marker).' }
  if (typeof f.formatVersion !== 'number' || f.formatVersion > FORMAT_VERSION) return { ok: false, fatal: 'This backup was made by a newer version of Cadence. Update the app first.' }
  if (typeof f.tables !== 'object' || f.tables === null || Array.isArray(f.tables)) return { ok: false, fatal: 'The backup has no tables.' }
  return { ok: true, file: data as BackupFile }
}

/** Dry run: validate everything and compare with what's already here. Writes nothing. */
export async function previewImport(text: string): Promise<ImportPreview> {
  const empty: ImportPreview = { ok: false, counts: {}, issues: [], totalRows: 0, clean: {} }
  const parsed = parseBackup(text)
  if (!parsed.ok) return { ...empty, fatal: parsed.fatal }
  const tables = parsed.file.tables as Record<string, unknown>
  let total = 0
  for (const v of Object.values(tables)) total += Array.isArray(v) ? v.length : 0
  if (total > MAX_IMPORT_ROWS) return { ...empty, fatal: `Too many rows (${total.toLocaleString()}).` }

  const prev: ImportPreview = { ok: true, counts: {}, issues: [], totalRows: total, clean: {} }
  for (const key of Object.keys(tables)) {
    if (!(SYNC_TABLES as readonly string[]).includes(key)) {
      prev.issues.push({ table: key, index: -1, message: 'unknown table — ignored' })
      continue
    }
    const name = key as SyncTable
    const rows = tables[key]
    if (!Array.isArray(rows)) {
      prev.issues.push({ table: name, index: -1, message: 'not a list — ignored' })
      continue
    }
    const local = new Map((await tableOf(name).toArray()).map((r) => [r.id, r as Record<string, unknown>]))
    const c = { incoming: rows.length, added: 0, updated: 0, unchanged: 0, invalid: 0 }
    const clean: Record<string, unknown>[] = []
    rows.forEach((raw, index) => {
      const v = validateRow(name, raw)
      if (!v.ok) {
        c.invalid++
        if (prev.issues.length < 50) prev.issues.push({ table: name, index, message: v.message })
        return
      }
      const cur = local.get(v.row.id as string)
      if (!cur) c.added++
      else if (String(v.row.updatedAt) > String(cur.updatedAt)) c.updated++
      else {
        c.unchanged++
        return
      }
      clean.push(v.row)
    })
    prev.counts[name] = c
    prev.clean[name] = clean
  }
  return prev
}

export interface ImportResult {
  written: number
  skipped: number
}

/**
 * Commit a PREVIEWED import. Merge, last-write-wins on updatedAt (the preview already dropped older rows).
 * Imported rows are queued for cloud sync with their own updatedAt. A unique-index collision (a different id for the
 * same date/week) skips that row rather than aborting the import.
 */
export async function commitImport(preview: ImportPreview): Promise<ImportResult> {
  const res: ImportResult = { written: 0, skipped: 0 }
  const now = stamp()
  for (const name of SYNC_TABLES) {
    const rows = preview.clean[name]
    if (!rows?.length) continue
    for (const row of rows) {
      try {
        await db.transaction('rw', [tableOf(name), db.syncQueue], async () => {
          await tableOf(name).put(row as never)
          const seedable = row as { seeded?: boolean; userModified?: boolean }
          if (!(seedable.seeded === true && seedable.userModified !== true)) {
            const { syncedAt: _s, ...payload } = row
            const q: SyncQueueRow = { id: `${name}:${row.id as string}`, table: name, rowId: row.id as string, op: row.deletedAt ? 'delete' : 'put', payload, createdAt: now, attempts: 0 }
            await db.syncQueue.put(q)
          }
        })
        res.written++
      } catch (e) {
        if (e instanceof Error && e.name === 'ConstraintError') res.skipped++
        else throw e
      }
    }
  }
  return res
}

/** Row counts per table (non-deleted / total) for Settings → diagnostics. */
export async function tableCounts(): Promise<{ table: string; live: number; total: number }[]> {
  const out = []
  for (const name of SYNC_TABLES) {
    const rows = await tableOf(name).toArray()
    out.push({ table: name, live: rows.filter((r) => !r.deletedAt).length, total: rows.length })
  }
  return out
}

/** Wipe local user data (keeps the sync-free seed bundle — it re-seeds). Irreversible: callers confirm first. */
export async function eraseLocalData(): Promise<void> {
  await db.transaction('rw', [...SYNC_TABLES.map((n) => tableOf(n)), db.syncQueue, db.syncMeta], async () => {
    for (const n of SYNC_TABLES) await tableOf(n).clear()
    await db.syncQueue.clear()
    await db.syncMeta.clear()
  })
}
