import type { ApplicationStatus } from '@/lib/enums'
import { APPLICATION_STATUSES } from '@/lib/enums'

/**
 * Application status state machine. Illegal transitions must be UNREACHABLE in the UI, not merely
 * rejected: the status picker is built from nextStates(current) and no component accepts an
 * arbitrary target status. Self-loops exist on OA and INTERVIEW only (retakes, second rounds).
 */
const TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  SAVED: ['APPLIED', 'REJECTED'],
  APPLIED: ['OA', 'INTERVIEW', 'REJECTED', 'GHOSTED'],
  OA: ['OA', 'INTERVIEW', 'REJECTED', 'GHOSTED'],
  INTERVIEW: ['INTERVIEW', 'OFFER', 'REJECTED', 'GHOSTED'],
  OFFER: ['REJECTED'],
  REJECTED: [],
  GHOSTED: ['INTERVIEW', 'REJECTED'],
}

export const nextStates = (current: ApplicationStatus): readonly ApplicationStatus[] => TRANSITIONS[current]
export const canTransition = (from: ApplicationStatus, to: ApplicationStatus): boolean => TRANSITIONS[from].includes(to)
export const isTerminal = (s: ApplicationStatus): boolean => TRANSITIONS[s].length === 0

export type TransitionResult = { ok: true; status: ApplicationStatus } | { ok: false; reason: string }
export function transition(from: ApplicationStatus, to: ApplicationStatus): TransitionResult {
  return canTransition(from, to) ? { ok: true, status: to } : { ok: false, reason: `Illegal transition ${from} → ${to}` }
}

/** Funnel order for the grouped list. */
export const FUNNEL_ORDER: readonly ApplicationStatus[] = ['OFFER', 'INTERVIEW', 'OA', 'APPLIED', 'SAVED', 'GHOSTED', 'REJECTED']

/**
 * A current-status CENSUS — how many applications are in each state RIGHT NOW. It is deliberately NOT a
 * conversion funnel: status history isn't stored, so "of 20 applied, 3 reached OA" can't be computed
 * honestly. Zeros are shown, including rejections.
 */
export function statusCensus(apps: { status: ApplicationStatus }[]): Record<ApplicationStatus, number> {
  const out = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>
  for (const a of apps) out[a.status]++
  return out
}
