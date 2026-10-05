import type { BlockType, Track } from '@/lib/enums'
import { isWeekend } from './dates'
import type { DateStr } from './dates'

/**
 * blockType is DERIVED AT WRITE TIME from track and date, then stored — never recomputed.
 *   weekend date          → WEEKEND
 *   4th+ block that day   → AD_HOC
 *   track DSA             → DEEP_A
 *   APPLICATIONS/WRITING  → BLOCK_C
 *   otherwise             → DEEP_B
 */
export function deriveBlockType(input: { date: DateStr; track: Track; blocksAlreadyToday: number }): BlockType {
  if (isWeekend(input.date)) return 'WEEKEND'
  if (input.blocksAlreadyToday >= 3) return 'AD_HOC'
  if (input.track === 'DSA') return 'DEEP_A'
  if (input.track === 'APPLICATIONS' || input.track === 'WRITING') return 'BLOCK_C'
  return 'DEEP_B'
}
