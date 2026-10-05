import { TRACKS, type Track } from '../enums'
import { LIMITS, type ChatRequest, type ChatTurn, type PackRequest } from './types'

/**
 * DATA MINIMISATION — the rule that matters most.
 * These builders PICK named fields from whatever they are given. They never spread, never forward unknown
 * properties, so a database row (or a UI object that happens to hold one) can't leak sleep, energy, company
 * names, notes, applications, or logs: leaks happen by spreading a row, not by typing a value.
 */
const clip = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const clipKeepNewlines = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '')

export function buildPackRequest(input: { topic?: unknown; track?: unknown; cardCount?: unknown }): PackRequest | null {
  const topic = clip(input.topic, LIMITS.topic)
  if (!topic) return null
  const track: PackRequest['track'] = (TRACKS as readonly unknown[]).includes(input.track) ? (input.track as Track) : 'GENERAL'
  const n = Math.round(Number(input.cardCount))
  const cardCount = Number.isFinite(n) ? Math.min(LIMITS.maxCards, Math.max(LIMITS.minCards, n)) : 8
  return { topic, track, cardCount }
}

function buildHistory(h: unknown): ChatTurn[] | undefined {
  if (!Array.isArray(h)) return undefined
  const turns: ChatTurn[] = []
  for (const t of h.slice(-LIMITS.historyTurns)) {
    const role = (t as { role?: unknown })?.role
    const content = clipKeepNewlines((t as { content?: unknown })?.content, LIMITS.turn)
    if ((role === 'user' || role === 'assistant') && content) turns.push({ role, content })
  }
  return turns.length ? turns : undefined
}

export function buildChatRequest(input: { question?: unknown; packContext?: unknown; excerpt?: unknown; history?: unknown }): ChatRequest | null {
  const question = clipKeepNewlines(input.question, LIMITS.question)
  if (!question) return null
  const out: ChatRequest = { question }
  const packContext = clip(input.packContext, LIMITS.packContext)
  const excerpt = clipKeepNewlines(input.excerpt, LIMITS.excerpt)
  const history = buildHistory(input.history)
  if (packContext) out.packContext = packContext
  if (excerpt) out.excerpt = excerpt
  if (history) out.history = history
  return out
}
