import type { Track } from '../enums'

/**
 * Every AI function returns a discriminated result and NEVER throws. Each failure reason maps to a specific,
 * honest message — MODEL_RETIRED in particular must not read as "server error", or someone goes debugging the
 * network for what is a configuration problem.
 */
export const AI_FAILURES = ['NO_KEY', 'OFFLINE', 'RATE_LIMIT', 'AUTH', 'TIMEOUT', 'SERVER', 'MALFORMED', 'MODEL_RETIRED'] as const
export type AiFailure = (typeof AI_FAILURES)[number]

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure; detail?: string }

export const AI_MESSAGES: Record<AiFailure, string> = {
  NO_KEY: 'AI isn’t set up yet: there is no Groq key, or Groq rejected it (revoked or mistyped). See Settings.',
  OFFLINE: 'You’re offline. Chat and pack generation need a connection; everything else works without one.',
  RATE_LIMIT: 'Too many requests right now (rate limit). Wait a minute and try again.',
  AUTH: 'Sign in first (Settings → Sync): AI requests are tied to your account so the key stays on the server.',
  TIMEOUT: 'The model took too long to answer. Try again, or ask something shorter.',
  SERVER: 'The AI service had a problem on its side. Try again in a moment.',
  MALFORMED: 'The model’s answer wasn’t in a usable shape, so nothing was saved. Try again.',
  MODEL_RETIRED: 'The configured model has been retired by Groq. This is a configuration problem, not a network one: update the model ids in the Edge Function (supabase/functions/ai/models.ts) and redeploy.',
}

/* ───────────── Requests: NARROW typed objects. Never a database row. ───────────── */

export interface PackRequest {
  topic: string
  track: Track | 'GENERAL'
  cardCount: number
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}
export interface ChatRequest {
  question: string
  /** Title/topic of the pack being read (a label, not a row). */
  packContext?: string
  /** The excerpt of the card the question is about. */
  excerpt?: string
  history?: ChatTurn[]
}

export const LIMITS = { topic: 120, question: 1000, packContext: 120, excerpt: 1500, turn: 1500, historyTurns: 6, minCards: 6, maxCards: 10 } as const

export interface ChatReply {
  reply: string
}
export interface AiHealth {
  configured: boolean
  /** Configured model ids that the provider currently serves. */
  available: string[]
  /** Configured model ids the provider no longer lists — MODEL_RETIRED waiting to happen. */
  missing: string[]
}
