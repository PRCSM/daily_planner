import { LEARNING_TRACKS, type Track } from '@/lib/enums'

/**
 * AI-OFF integrity: AI is OFF for learning (DSA, CORE_CS, SYSTEM_DESIGN, OOP_LLD) and ON for shipping.
 * Learning blocks logged with aiUsed=true are flagged in amber — factual, not shaming.
 */
interface B {
  track: Track
  aiUsed: boolean
}
export const isLearning = (b: Pick<B, 'track'>): boolean => LEARNING_TRACKS.includes(b.track)
export const isAiViolation = (b: B): boolean => isLearning(b) && b.aiUsed

/**
 * % of learning blocks that were AI-free. Returns NULL when there are no learning blocks —
 * not 0% (a false accusation) and not 100% (unearned credit).
 */
export function aiFreeLearningPct(blocks: B[]): number | null {
  const learning = blocks.filter(isLearning)
  if (learning.length === 0) return null
  return Math.round((100 * learning.filter((b) => !b.aiUsed).length) / learning.length)
}
