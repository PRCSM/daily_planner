import { addBlock, blocksForLog, ensureLog, getBlock, newBlock, patchLog, removeBlock, updateBlock } from '@/data/repos/logs'
import { allWeeks } from '@/data/repos/plan'
import { addProblem, getProblem, updateProblem } from '@/data/repos/dsa'
import { runTx } from '@/data/rows'
import type { DailyLogRow, DsaProblemRow, LogBlockRow, WeeklyTargetRow } from '@/data/types'
import { deriveBlockType } from '@/domain/blockType'
import { isAiViolation } from '@/domain/aiOff'
import { scheduleAfterReview, scheduleAfterSolve } from '@/domain/spaced'
import { phaseForWeek, planStartOf, weekNumberFor } from '@/domain/weeks'
import type { Difficulty, DsaStatus, Track } from '@/lib/enums'

/**
 * Write orchestration for logging. domain/ decides (block type, review schedule); data/ persists.
 * `date` / `today` are REQUIRED parameters everywhere — a default is how wrong-day bugs happen.
 */

/** The daily log for `date`, created on first write with week/phase derived from the plan. */
async function logFor(date: string, loaded?: WeeklyTargetRow[]): Promise<DailyLogRow> {
  const weeks = loaded ?? (await allWeeks())
  const weekNumber = weekNumberFor(date, planStartOf(weeks))
  return ensureLog(date, { weekNumber, phase: phaseForWeek(weekNumber) })
}

/** aiOffRespected is DERIVED (true unless a learning block used AI) and re-derived after every block change. */
async function refreshAiOff(logId: string): Promise<void> {
  const blocks = await blocksForLog(logId)
  await patchLog(logId, { aiOffRespected: !blocks.some(isAiViolation) })
}

export interface NewBlockInput {
  date: string
  track: Track
  minutes: number
  topic?: string
  aiUsed: boolean
  notes?: string
}

export async function addLogBlock(input: NewBlockInput): Promise<LogBlockRow> {
  if (!(input.minutes > 0)) throw new Error('minutes must be positive')
  const weeks = await allWeeks() // outside the transaction: weeklyTargets isn't part of it
  return runTx(['dailyLogs', 'logBlocks'], async () => {
    const log = await logFor(input.date, weeks)
    const already = (await blocksForLog(log.id)).length
    const blockType = deriveBlockType({ date: input.date, track: input.track, blocksAlreadyToday: already })
    const topic = input.topic?.trim() || undefined
    const block = await addBlock(newBlock({ logId: log.id, date: input.date, blockType, track: input.track, minutes: Math.round(input.minutes), topic, aiUsed: input.aiUsed, notes: input.notes }))
    await refreshAiOff(log.id)
    return block
  })
}

/** Editing minutes/topic/AI never recomputes blockType: it was derived at write time and is stored. */
export async function editLogBlock(id: string, patch: Partial<Pick<LogBlockRow, 'minutes' | 'topic' | 'aiUsed' | 'notes'>>): Promise<void> {
  await runTx(['dailyLogs', 'logBlocks'], async () => {
    const b = await updateBlock(id, patch)
    await refreshAiOff(b.logId)
  })
}

export async function deleteLogBlock(id: string): Promise<void> {
  await runTx(['dailyLogs', 'logBlocks'], async () => {
    const b = await getBlock(id)
    if (!b) return
    await removeBlock(id)
    await refreshAiOff(b.logId)
  })
}

export type LogPatch = Partial<Pick<DailyLogRow, 'shipped' | 'blockers' | 'applicationsSent' | 'notes' | 'conceptsLearned'>>
export async function patchDay(date: string, patch: LogPatch): Promise<DailyLogRow> {
  const log = await logFor(date)
  return patchLog(log.id, patch)
}

export interface FuelPatch {
  sleepHours?: number
  trained?: boolean
  energy?: number
}
/** Marks fuel as ENTERED — only then does it count as data (sleep line, tomorrow's defaults). */
export async function setFuel(date: string, patch: FuelPatch): Promise<DailyLogRow> {
  const log = await logFor(date)
  return patchLog(log.id, { ...patch, fuelEntered: true })
}

export interface NewProblemInput {
  title: string
  pattern: string
  difficulty: Difficulty
  status: DsaStatus
  source?: string
  url?: string
  timeMinutes?: number
  solvedDate: string
}
/** Spaced repetition is automatic: the schedule comes from the outcome, the user never manages it. */
export async function addDsaProblem(input: NewProblemInput): Promise<DsaProblemRow> {
  const sched = scheduleAfterSolve(input.status, input.solvedDate)
  return addProblem({
    title: input.title.trim(),
    source: input.source?.trim() || 'LeetCode',
    url: input.url,
    pattern: input.pattern,
    difficulty: input.difficulty,
    status: input.status,
    timeMinutes: input.timeMinutes,
    solvedDate: input.solvedDate,
    reviewDue: sched.reviewDue,
    reviewCount: sched.reviewCount,
  })
}

export async function reviewDsaProblem(id: string, clean: boolean, today: string): Promise<DsaProblemRow> {
  const p = await getProblem(id)
  if (!p) throw new Error('problem not found')
  const next = scheduleAfterReview(p, today, clean)
  return updateProblem(id, { reviewDue: next.reviewDue, reviewCount: next.reviewCount, lastReviewedDate: next.lastReviewedDate })
}
