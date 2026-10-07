/**
 * Capgemini 2027 exam prep — shared constants and tag helpers. A leaf module: the seed builds rows from these, the
 * Learn screen reads them back, and neither has to know how the other works.
 *
 * Packs carry their meaning in `tags`:
 *   capgemini            → belongs to the exam-prep collection (kept out of the generic "today's pack" picker)
 *   cg-<kind>            → lesson | drill | coding | debug | interview | prompt | english
 *   cg-d<N>              → scheduled on prep day N (1…60); a pack can be scheduled on several days
 */
export const CAPG_DAY_ONE = '2026-10-07'
export const CAPG_DAYS = 60
/** A placeholder: 60 prep days plus two spare. The real date comes from the user's invitation — it is editable in Calendar. */
export const CAPG_EXAM_DEFAULT = '2026-12-07'
export const CAPG_EXAM_SEED_KEY = 'ms-capgemini-exam'

export const CAPG_TAG = 'capgemini'
export const CAPG_KINDS = ['lesson', 'drill', 'coding', 'debug', 'interview', 'prompt', 'english'] as const
export type CapgKind = (typeof CAPG_KINDS)[number]
export const CAPG_KIND_LABEL: Record<CapgKind, string> = {
  lesson: 'Lessons',
  drill: 'Drills',
  coding: 'Coding',
  debug: 'Debugging',
  interview: 'Interview',
  prompt: 'Prompt & AI coding',
  english: 'English',
}
/** Singular, for a pack tile's small caption. */
export const CAPG_KIND_NAME: Record<CapgKind, string> = {
  lesson: 'Lesson',
  drill: 'Drill',
  coding: 'Coding',
  debug: 'Debugging',
  interview: 'Interview',
  prompt: 'Prompt lab',
  english: 'English',
}

export const capgKindTag = (k: CapgKind): string => `cg-${k}`
export const capgDayTag = (n: number): string => `cg-d${n}`
export const isCapgTags = (tags: readonly string[]): boolean => tags.includes(CAPG_TAG)
export const capgKindOf = (tags: readonly string[]): CapgKind | undefined => CAPG_KINDS.find((k) => tags.includes(capgKindTag(k)))

const utc = (d: string): number => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, day)
}
/** Prep day number of `date` (day 1 = CAPG_DAY_ONE). ≤ 0 is before the window, > CAPG_DAYS is after it. Pure. */
export const capgDayNumber = (date: string): number => Math.round((utc(date) - utc(CAPG_DAY_ONE)) / 86_400_000) + 1
