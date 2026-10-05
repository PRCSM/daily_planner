import type { DailyLogRow } from '@/data/types'

/** What the fuel row shows before the user touches it: YESTERDAY's values, as ghosts — not written until accepted. */
export interface FuelValues {
  sleepHours: number
  trained: boolean
  energy: number
}
export const FUEL_FALLBACK: FuelValues = { sleepHours: 7, trained: false, energy: 3 }

export function fuelDefaults(prev?: Pick<DailyLogRow, 'sleepHours' | 'trained' | 'energy' | 'fuelEntered'>): FuelValues {
  if (!prev || !prev.fuelEntered) return FUEL_FALLBACK
  return { sleepHours: prev.sleepHours ?? FUEL_FALLBACK.sleepHours, trained: prev.trained, energy: prev.energy }
}

/** Autocomplete chips: topics (newest first) whose text starts-with / contains the query, same-track first. */
export function topicSuggestions(history: { topic: string; track: string }[], query: string, track: string, limit = 5): string[] {
  const q = query.trim().toLowerCase()
  const scored = history
    .map((h, i) => {
      const t = h.topic.toLowerCase()
      if (q && !t.includes(q)) return null
      if (q && t === q) return null // already typed in full
      const score = (h.track === track ? 0 : 1000) + (q && t.startsWith(q) ? 0 : 100) + i
      return { topic: h.topic, score }
    })
    .filter((x): x is { topic: string; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
  return [...new Set(scored.map((s) => s.topic))].slice(0, limit)
}

/** Order tracks last-used first, then the rest in canonical order. */
export function orderTracks<T extends string>(all: readonly T[], recent: readonly T[]): T[] {
  return [...recent.filter((t) => all.includes(t)), ...all.filter((t) => !recent.includes(t))]
}
