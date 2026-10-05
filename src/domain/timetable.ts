import { fromMinutes, toMinutes } from './dates'

/** A timetable grid: `count` consecutive periods of `length` minutes starting at `start`. */
export interface Layout {
  start: string
  length: number
  count: number
  /** 0 = Sunday … 6 = Saturday. Default Mon–Fri. */
  days: number[]
}
export const DEFAULT_LAYOUT: Layout = { start: '09:00', length: 50, count: 6, days: [1, 2, 3, 4, 5] }

export interface Period {
  index: number
  start: string
  end: string
}

export function periodsOf(l: Layout): Period[] {
  return Array.from({ length: l.count }, (_, i) => {
    const s = toMinutes(l.start) + i * l.length
    return { index: i, start: fromMinutes(s), end: fromMinutes(s + l.length) }
  })
}

export interface SlotLike {
  id?: string
  title: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location?: string
  kind?: 'CLASS' | 'LAB' | 'BREAK' | 'OTHER'
  active?: boolean
}

export const kindFor = (title: string): 'CLASS' | 'LAB' | 'BREAK' | 'OTHER' => {
  const t = title.toLowerCase()
  if (/\b(lab|practical)\b/.test(t)) return 'LAB'
  if (/\b(break|lunch|recess)\b/.test(t)) return 'BREAK'
  return 'CLASS'
}

export const cellSlot = <T extends SlotLike>(slots: T[], day: number, p: Period): T | undefined => slots.find((s) => s.active !== false && s.dayOfWeek === day && s.startTime === p.start)

/* ─────────────── Import (.ics / .csv) — a trust boundary: everything is validated ─────────────── */

export const MAX_IMPORT_BYTES = 1_000_000
export const MAX_IMPORT_SLOTS = 500
export interface ImportIssue {
  where: string
  message: string
}
export interface ImportResult {
  slots: SlotLike[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}
const ICS_DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

export function parseDay(v: string): number | null {
  const s = v.trim().toLowerCase()
  if (s in DAY_NAMES) return DAY_NAMES[s]!
  if (/^[0-6]$/.test(s)) return Number(s)
  return null
}

/** "9:00", "09:00", "9am", "9:30 pm", "1730" → "HH:mm", or null. */
export function parseTime(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/\./g, '')
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (m[3]) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0)
  }
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Minimal RFC-4180 CSV reader (quotes, escaped quotes, CRLF). */
export function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const HEADER_ALIASES: Record<string, string> = { title: 'title', subject: 'title', course: 'title', name: 'title', class: 'title', day: 'day', weekday: 'day', start: 'start', starttime: 'start', from: 'start', end: 'end', endtime: 'end', to: 'end', location: 'location', room: 'location', venue: 'location', kind: 'kind', type: 'kind' }

function clean(s: string): string {
  // Strip control chars and cap length: imported text is untrusted (it is only ever rendered as text, but keep it tidy).
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80)
}

export function parseCsv(text: string): ImportResult {
  const out: ImportResult = { slots: [], errors: [], warnings: [] }
  if (text.length > MAX_IMPORT_BYTES) return { ...out, errors: [{ where: 'file', message: 'File is too large (max 1 MB).' }] }
  const rows = readCsv(text)
  if (rows.length === 0) return { ...out, errors: [{ where: 'file', message: 'The file is empty.' }] }
  const header = rows[0]!.map((h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s_-]/g, '')] ?? '')
  for (const need of ['title', 'day', 'start', 'end']) {
    if (!header.includes(need)) out.errors.push({ where: 'header', message: `Missing a “${need}” column.` })
  }
  if (out.errors.length) return out
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? ''
  for (let i = 1; i < rows.length; i++) {
    if (out.slots.length >= MAX_IMPORT_SLOTS) {
      out.warnings.push({ where: `line ${i + 1}`, message: `Stopped at ${MAX_IMPORT_SLOTS} rows.` })
      break
    }
    const r = rows[i]!
    const where = `line ${i + 1}`
    const title = clean(col(r, 'title'))
    const day = parseDay(col(r, 'day'))
    const start = parseTime(col(r, 'start'))
    const end = parseTime(col(r, 'end'))
    if (!title) out.errors.push({ where, message: 'Missing title.' })
    else if (day === null) out.errors.push({ where, message: `Unrecognised day “${clean(col(r, 'day'))}”.` })
    else if (!start || !end) out.errors.push({ where, message: 'Start/end time not understood.' })
    else if (toMinutes(end) <= toMinutes(start)) out.errors.push({ where, message: 'End must be after start.' })
    else {
      const loc = clean(col(r, 'location'))
      const k = col(r, 'kind').trim().toUpperCase()
      out.slots.push({ title, dayOfWeek: day, startTime: start, endTime: end, location: loc || undefined, kind: (['CLASS', 'LAB', 'BREAK', 'OTHER'] as const).find((x) => x === k) ?? kindFor(title), active: true })
    }
  }
  return out
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}
const icsUnescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

/** DTSTART:20260803T090000 · DTSTART;TZID=Asia/Kolkata:20260803T090000 · …Z (UTC → the device's local time). */
function icsDateTime(value: string): { date: string; time: string; day: number } | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, , z] = m
  let dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
  if (z) {
    // Absolute UTC instant → local wall clock on this device.
    const hh = dt.getHours()
    const mm = dt.getMinutes()
    return { date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, day: dt.getDay() }
  }
  dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, day: dt.getUTCDay() }
}

export function parseIcs(text: string): ImportResult {
  const out: ImportResult = { slots: [], errors: [], warnings: [] }
  if (text.length > MAX_IMPORT_BYTES) return { ...out, errors: [{ where: 'file', message: 'File is too large (max 1 MB).' }] }
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ...out, errors: [{ where: 'file', message: 'This doesn’t look like an .ics calendar file.' }] }
  const lines = unfold(text)
  let ev: Record<string, string> | null = null
  let n = 0
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) ev = {}
    else if (/^END:VEVENT/i.test(line) && ev) {
      n++
      const where = `event ${n}`
      const e = ev
      ev = null
      if (out.slots.length >= MAX_IMPORT_SLOTS) {
        out.warnings.push({ where, message: `Stopped at ${MAX_IMPORT_SLOTS} events.` })
        break
      }
      const title = clean(icsUnescape(e.SUMMARY ?? ''))
      const s = icsDateTime(e.DTSTART ?? '')
      const en = icsDateTime(e.DTEND ?? '')
      if (!title) out.errors.push({ where, message: 'Missing SUMMARY.' })
      else if (!s || !en) out.errors.push({ where, message: 'All-day or unrecognised start/end — skipped.' })
      else if (toMinutes(en.time) <= toMinutes(s.time)) out.errors.push({ where, message: 'End must be after start on the same day.' })
      else {
        const rule = e.RRULE ?? ''
        const byday = /BYDAY=([A-Z,]+)/.exec(rule)?.[1]
        const days = byday ? byday.split(',').map((d) => ICS_DAYS[d.replace(/^[-+]?\d+/, '')]).filter((d): d is number => d !== undefined) : [s.day]
        if (!rule) out.warnings.push({ where, message: `“${title}” is a single event; imported as a weekly slot.` })
        const loc = clean(icsUnescape(e.LOCATION ?? ''))
        for (const day of days) out.slots.push({ title, dayOfWeek: day, startTime: s.time, endTime: en.time, location: loc || undefined, kind: kindFor(title), active: true })
      }
    } else if (ev) {
      const m = /^([A-Z-]+)(?:;[^:]*)?:(.*)$/i.exec(line)
      if (m) ev[m[1]!.toUpperCase()] = m[2]!
    }
  }
  if (out.slots.length === 0 && out.errors.length === 0) out.errors.push({ where: 'file', message: 'No events found.' })
  return dedupe(out)
}

function dedupe(r: ImportResult): ImportResult {
  const seen = new Set<string>()
  const slots = r.slots.filter((s) => {
    const k = `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.title.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { ...r, slots }
}

export function parseTimetableFile(name: string, text: string): ImportResult {
  return /\.ics$/i.test(name) ? parseIcs(text) : parseCsv(text)
}
