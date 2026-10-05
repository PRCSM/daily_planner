import type { ApplicationRow } from '@/data/types'
import { addDays, diffDays } from './dates'
import type { DateStr } from './dates'

export const FOLLOW_UP_DAYS = 7
export const defaultFollowUp = (appliedDate: DateStr): DateStr => addDays(appliedDate, FOLLOW_UP_DAYS)

export const isFollowUpDue = (a: Pick<ApplicationRow, 'status' | 'nextFollowUp'>, today: DateStr): boolean =>
  !!a.nextFollowUp && a.nextFollowUp <= today && (a.status === 'APPLIED' || a.status === 'OA' || a.status === 'INTERVIEW')

export const daysSinceApplied = (a: Pick<ApplicationRow, 'appliedDate'>, today: DateStr): number | null => (a.appliedDate ? diffDays(a.appliedDate, today) : null)
