import { describe, expect, it } from 'vitest'
import { aiFreeLearningPct, isAiViolation, isLearning } from './aiOff'

describe('AI-OFF integrity', () => {
  it('returns NULL (not 0, not 100) when there are no learning blocks', () => {
    expect(aiFreeLearningPct([])).toBeNull()
    expect(aiFreeLearningPct([{ track: 'PROJECT', aiUsed: true }, { track: 'APPLICATIONS', aiUsed: false }, { track: 'GENAI', aiUsed: true }])).toBeNull()
  })
  it('only learning tracks count', () => {
    expect(['DSA', 'CORE_CS', 'SYSTEM_DESIGN', 'OOP_LLD'].every((t) => isLearning({ track: t as never }))).toBe(true)
    expect(['GENAI', 'PROJECT', 'APPLICATIONS', 'WRITING'].some((t) => isLearning({ track: t as never }))).toBe(false)
  })
  it('AI use on a shipping track is not a violation', () => {
    expect(isAiViolation({ track: 'PROJECT', aiUsed: true })).toBe(false)
    expect(isAiViolation({ track: 'DSA', aiUsed: true })).toBe(true)
    expect(isAiViolation({ track: 'DSA', aiUsed: false })).toBe(false)
  })
  it('computes the percentage over learning blocks only', () => {
    const blocks = [
      { track: 'DSA', aiUsed: false }, { track: 'DSA', aiUsed: false }, { track: 'CORE_CS', aiUsed: true }, { track: 'SYSTEM_DESIGN', aiUsed: false },
      { track: 'PROJECT', aiUsed: true }, // ignored
    ] as const
    expect(aiFreeLearningPct([...blocks])).toBe(75)
  })
  it('0% is reachable when every learning block used AI; 100% when none did', () => {
    expect(aiFreeLearningPct([{ track: 'DSA', aiUsed: true }])).toBe(0)
    expect(aiFreeLearningPct([{ track: 'DSA', aiUsed: false }])).toBe(100)
  })
})
