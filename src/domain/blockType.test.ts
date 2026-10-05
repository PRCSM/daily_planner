import { describe, expect, it } from 'vitest'
import { TRACKS } from '@/lib/enums'
import { addDays, startOfWeek } from './dates'
import { deriveBlockType } from './blockType'
import { T0 } from '@/test/factories'

const MON = startOfWeek(T0)
const SAT = addDays(MON, 5)
const SUN = addDays(MON, 6)

describe('deriveBlockType', () => {
  it('weekend dates are WEEKEND regardless of track', () => {
    for (const t of TRACKS) for (const d of [SAT, SUN]) expect(deriveBlockType({ date: d, track: t, blocksAlreadyToday: 0 })).toBe('WEEKEND')
  })
  it('weekday: DSA → DEEP_A; APPLICATIONS/WRITING → BLOCK_C; the rest → DEEP_B', () => {
    expect(deriveBlockType({ date: MON, track: 'DSA', blocksAlreadyToday: 0 })).toBe('DEEP_A')
    expect(deriveBlockType({ date: MON, track: 'APPLICATIONS', blocksAlreadyToday: 0 })).toBe('BLOCK_C')
    expect(deriveBlockType({ date: MON, track: 'WRITING', blocksAlreadyToday: 0 })).toBe('BLOCK_C')
    for (const t of ['CORE_CS', 'SYSTEM_DESIGN', 'OOP_LLD', 'GENAI', 'PROJECT'] as const) expect(deriveBlockType({ date: MON, track: t, blocksAlreadyToday: 0 })).toBe('DEEP_B')
  })
  it('the 4th+ block of a weekday is AD_HOC (3 already logged), whatever the track', () => {
    expect(deriveBlockType({ date: MON, track: 'DSA', blocksAlreadyToday: 2 })).toBe('DEEP_A')
    expect(deriveBlockType({ date: MON, track: 'DSA', blocksAlreadyToday: 3 })).toBe('AD_HOC')
    expect(deriveBlockType({ date: MON, track: 'APPLICATIONS', blocksAlreadyToday: 9 })).toBe('AD_HOC')
  })
  it('WEEKEND outranks AD_HOC', () => {
    expect(deriveBlockType({ date: SUN, track: 'DSA', blocksAlreadyToday: 5 })).toBe('WEEKEND')
  })
})
