import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/**
 * All date math. Dates are "YYYY-MM-DD" strings; arithmetic runs in UTC *on the string's own
 * calendar fields*, so DST (and the machine's timezone) can never shift a day. Nothing here
 * reads the clock — callers pass `today`.
 */
export type DateStr = string
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const p = (d: DateStr) => dayjs.utc(d)

export function isValidDate(d: unknown): d is DateStr {
  if (typeof d !== 'string' || !DATE_RE.test(d)) return false
  return p(d).format('YYYY-MM-DD') === d // rejects 2026-02-30
}
export function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && TIME_RE.test(t)
}

export const addDays = (d: DateStr, n: number): DateStr => p(d).add(n, 'day').format('YYYY-MM-DD')
/** b − a in whole days. */
export const diffDays = (a: DateStr, b: DateStr): number => Math.round(p(b).diff(p(a), 'day', true))
/** 0 = Sunday … 6 = Saturday */
export const dayOfWeek = (d: DateStr): number => p(d).day()
export const isWeekend = (d: DateStr): boolean => dayOfWeek(d) === 0 || dayOfWeek(d) === 6
export const isWeekday = (d: DateStr): boolean => !isWeekend(d)
export const compareDates = (a: DateStr, b: DateStr): number => (a < b ? -1 : a > b ? 1 : 0)
export const maxDate = (a: DateStr, b: DateStr): DateStr => (a > b ? a : b)
export const minDate = (a: DateStr, b: DateStr): DateStr => (a < b ? a : b)

/** Monday of the week containing d. */
export function startOfWeek(d: DateStr): DateStr {
  const dow = dayOfWeek(d)
  return addDays(d, dow === 0 ? -6 : 1 - dow)
}
export const endOfWeek = (d: DateStr): DateStr => addDays(startOfWeek(d), 6)

export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  const n = diffDays(from, to)
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}

export const startOfMonth = (d: DateStr): DateStr => p(d).startOf('month').format('YYYY-MM-DD')
export const endOfMonth = (d: DateStr): DateStr => p(d).endOf('month').format('YYYY-MM-DD')
export const addMonths = (d: DateStr, n: number): DateStr => startOfMonth(p(startOfMonth(d)).add(n, 'month').format('YYYY-MM-DD'))
export const monthKey = (d: DateStr): string => d.slice(0, 7)
export const monthLabel = (d: DateStr): string => p(d).format('MMMM YYYY')

/** 6-row (or 5-row) Monday-first grid covering the month of d. */
export function monthGrid(d: DateStr): DateStr[] {
  const first = startOfMonth(d)
  const start = startOfWeek(first)
  const end = endOfWeek(endOfMonth(d))
  return eachDay(start, end)
}

export const formatDay = (d: DateStr, fmt = 'ddd D MMM'): string => p(d).format(fmt)
export const formatLong = (d: DateStr): string => p(d).format('dddd, D MMMM')

/** "today", "tomorrow", "in 5d", "3d ago" */
export function relativeDay(d: DateStr, today: DateStr): string {
  const n = diffDays(today, d)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n}d` : `${-n}d ago`
}

/* ── Wall-clock times ("HH:mm") ── */
export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number) as [number, number]
  return h * 60 + m
}
export function fromMinutes(total: number): string {
  const t = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
export const durationMinutes = (start: string, end: string): number => Math.max(0, toMinutes(end) - toMinutes(start))
export const snapMinutes = (m: number, step = 15): number => Math.round(m / step) * step
export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
