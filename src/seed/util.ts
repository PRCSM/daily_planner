/** Tiny date helper for seed content (data/ may not import domain/). Pure — never reads the clock. */
export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

export const PLAN_START = '2026-07-13'
export const PLAN_END = '2026-11-15'
/** A fixed timestamp for seed rows: seeds are content, not user activity. */
export const SEED_STAMP = '2026-01-01T00:00:00.000Z'
