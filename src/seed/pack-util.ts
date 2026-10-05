import type { CardType, Track } from '@/lib/enums'
import type { ValidCard } from '@/lib/packSchema'

export interface PackSeed {
  key: string
  title: string
  topic: string
  track: Track
  weekNumber: number
  tags: string[]
  summary: string
  cards: ValidCard[]
}

/** Card builder: orderIndex is assigned by the pack (always contiguous). */
export function c(type: CardType, heading: string, body: string, codeSnippet?: string, codeLang?: string): ValidCard {
  return { orderIndex: -1, type, heading: heading || undefined, body: body || heading, codeSnippet, codeLang }
}
