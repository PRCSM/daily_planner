import { describe, expect, it } from 'vitest'
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/enums'
import { FUNNEL_ORDER, canTransition, isTerminal, nextStates, statusCensus, transition } from './applicationsFsm'

const SPEC: Record<ApplicationStatus, ApplicationStatus[]> = {
  SAVED: ['APPLIED', 'REJECTED'],
  APPLIED: ['OA', 'INTERVIEW', 'REJECTED', 'GHOSTED'],
  OA: ['OA', 'INTERVIEW', 'REJECTED', 'GHOSTED'],
  INTERVIEW: ['INTERVIEW', 'OFFER', 'REJECTED', 'GHOSTED'],
  OFFER: ['REJECTED'],
  REJECTED: [],
  GHOSTED: ['INTERVIEW', 'REJECTED'],
}

describe('application state machine', () => {
  it('matches the spec table exactly (all 49 pairs)', () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        expect(canTransition(from, to), `${from}→${to}`).toBe(SPEC[from].includes(to))
      }
    }
  })
  it('nextStates is what the picker is built from', () => {
    for (const s of APPLICATION_STATUSES) expect([...nextStates(s)]).toEqual(SPEC[s])
  })
  it('self-loops exist on OA and INTERVIEW only', () => {
    const loops = APPLICATION_STATUSES.filter((s) => canTransition(s, s))
    expect(loops).toEqual(['OA', 'INTERVIEW'])
  })
  it('REJECTED is the only terminal state', () => {
    expect(APPLICATION_STATUSES.filter(isTerminal)).toEqual(['REJECTED'])
  })
  it('SAVED cannot jump to OFFER; OFFER cannot go back to INTERVIEW; GHOSTED can revive', () => {
    expect(transition('SAVED', 'OFFER')).toMatchObject({ ok: false })
    expect(transition('OFFER', 'INTERVIEW')).toMatchObject({ ok: false })
    expect(transition('GHOSTED', 'INTERVIEW')).toEqual({ ok: true, status: 'INTERVIEW' })
  })
  it('census shows zeros for every status, including rejections — and is not a conversion funnel', () => {
    const c = statusCensus([{ status: 'APPLIED' }, { status: 'APPLIED' }, { status: 'OA' }])
    expect(c).toEqual({ SAVED: 0, APPLIED: 2, OA: 1, INTERVIEW: 0, OFFER: 0, REJECTED: 0, GHOSTED: 0 })
    expect(Object.keys(statusCensus([]))).toHaveLength(APPLICATION_STATUSES.length)
  })
  it('funnel order covers every status once', () => {
    expect([...FUNNEL_ORDER].sort()).toEqual([...APPLICATION_STATUSES].sort())
  })
})
