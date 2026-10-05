/**
 * THE ONE FUNCTION THAT READS THE LOCAL CLOCK.
 *
 * Everything else takes a date/time parameter. `new Date().toISOString().slice(0,10)`
 * is the UTC date and is wrong for ~5.5 hours a day in IST — so local parts are
 * built from getFullYear/getMonth/getDate, never from a UTC string.
 */
export interface ClockReading {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string
  /** Local wall-clock time, "HH:mm". */
  time: string
  /** The instant as an ISO-8601 UTC timestamp (for updatedAt stamps only). */
  iso: string
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

let source: () => Date = () => new Date()

/** Test seam: inject a fixed clock. Pass nothing to restore the real one. */
export function setClockSource(fn?: () => Date): void {
  source = fn ?? (() => new Date())
}

export function readClock(): ClockReading {
  const d = source()
  return {
    date: `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    iso: d.toISOString(),
  }
}

/** Build a Date from local parts — for tests and the clock seam only. */
export function localDate(date: string, time = '12:00'): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}
