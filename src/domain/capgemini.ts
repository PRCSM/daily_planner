import type { ContentPackRow, EventRow } from '@/data/types'
import { CAPG_DAYS, type CapgKind, capgDayNumber, capgDayTag, capgKindOf, isCapgTags } from '@/lib/capgemini'
import { diffDays } from './dates'
import type { DateStr } from './dates'

export type CapgWindow = 'BEFORE' | 'ACTIVE' | 'AFTER'

export interface CapgToday {
  window: CapgWindow
  /** 1…60 while ACTIVE; otherwise the (out-of-range) number, for display of the countdown only. */
  day: number
  lessons: ContentPackRow[]
  drills: ContentPackRow[]
  /** Coding, debugging, interview, prompt and English packs scheduled for the day. */
  practice: ContentPackRow[]
  /** Days until the exam (0 = today); null when there is no exam event or it has passed. */
  daysToExam: number | null
  /** True while the exam event is still the seeded placeholder date (the user has never edited it). */
  examUnconfirmed: boolean
}

const byTitle = (a: ContentPackRow, b: ContentPackRow) => a.title.localeCompare(b.title, undefined, { numeric: true })

/** What the Capgemini prep asks of `today`: the day's packs grouped by role, and the honest exam countdown. Pure. */
export function capgToday(packs: readonly ContentPackRow[], exam: Pick<EventRow, 'date' | 'userModified'> | undefined, today: DateStr): CapgToday {
  const day = capgDayNumber(today)
  const window: CapgWindow = day < 1 ? 'BEFORE' : day > CAPG_DAYS ? 'AFTER' : 'ACTIVE'
  const todays = window === 'ACTIVE' ? packs.filter((p) => !p.deletedAt && isCapgTags(p.tags) && p.tags.includes(capgDayTag(day))) : []
  const kind = (p: ContentPackRow): CapgKind | undefined => capgKindOf(p.tags)
  const toExam = exam ? diffDays(today, exam.date) : null
  return {
    window,
    day,
    lessons: todays.filter((p) => kind(p) === 'lesson').sort(byTitle),
    drills: todays.filter((p) => kind(p) === 'drill').sort(byTitle),
    practice: todays.filter((p) => kind(p) !== 'lesson' && kind(p) !== 'drill').sort(byTitle),
    daysToExam: toExam !== null && toExam >= 0 ? toExam : null,
    examUnconfirmed: !!exam && exam.userModified === false,
  }
}
