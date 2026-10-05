import type { ContentPackRow, DailyQuoteRow } from '@/data/types'
import { diffDays } from './dates'
import type { DateStr } from './dates'

const EPOCH: DateStr = '2024-01-01'

/** One quote per day, deterministic by date (same quote on every device, every reload). */
export function quoteForDate(quotes: DailyQuoteRow[], date: DateStr): DailyQuoteRow | undefined {
  const live = quotes.filter((q) => !q.deletedAt).sort((a, b) => a.id.localeCompare(b.id))
  if (live.length === 0) return undefined
  const n = diffDays(EPOCH, date)
  return live[((n % live.length) + live.length) % live.length]
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Today's pack: the unfinished pack whose tags best overlap this week's topics. Ties → the pack for
 * this exact week, then title order. Returns undefined when nothing overlaps (no recommendation feed).
 */
export function packForWeek(packs: ContentPackRow[], weekTopics: string[], weekNumber: number, completedPackIds: ReadonlySet<string>): ContentPackRow | undefined {
  const topics = new Set(weekTopics.map(norm))
  let best: { pack: ContentPackRow; score: number } | undefined
  for (const pack of packs) {
    if (pack.deletedAt) continue
    const overlap = pack.tags.filter((t) => topics.has(norm(t))).length
    const score = overlap * 10 + (pack.weekNumber === weekNumber ? 5 : 0) - (completedPackIds.has(pack.id) ? 100 : 0)
    if (overlap === 0 && pack.weekNumber !== weekNumber) continue
    if (!best || score > best.score || (score === best.score && pack.title.localeCompare(best.pack.title) < 0)) best = { pack, score }
  }
  return best && best.score > 0 ? best.pack : undefined
}
