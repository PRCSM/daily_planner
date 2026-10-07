/** Tiny date helper for seed content (data/ may not import domain/). Pure — never reads the clock. */
export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/**
 * The plan runs 18 whole weeks from Monday 5 Oct 2026 (week 1) to Sunday 7 Feb 2027 (week 18).
 * It was re-based from 13 Jul 2026 — exactly 12 weeks later — so progress starts from zero on the day the user began.
 * PLAN_BEGIN is the first day anything is scheduled (week 1 is a short week); every other plan date derives from
 * PLAN_START + week numbers (see weeks.ts), never from a literal.
 */
export const PLAN_START = '2026-10-05'
export const PLAN_BEGIN = '2026-10-07'
export const PLAN_END = '2027-02-07'
/** A fixed timestamp for seed rows: seeds are content, not user activity. */
export const SEED_STAMP = '2026-01-01T00:00:00.000Z'
