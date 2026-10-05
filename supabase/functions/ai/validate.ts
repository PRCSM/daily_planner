/**
 * Server-side validation of the request body. The client already builds narrow payloads (src/lib/ai/payloads.ts),
 * but a trust boundary validates for itself — and it REJECTS unknown keys, so a client that accidentally spreads
 * a database row into the request fails loudly instead of leaking.
 */
export const TRACKS = ['DSA', 'CORE_CS', 'SYSTEM_DESIGN', 'OOP_LLD', 'GENAI', 'PROJECT', 'APPLICATIONS', 'WRITING', 'GENERAL'] as const
export const MAX_BODY_BYTES = 16_000
export const LIM = { topic: 120, question: 1000, packContext: 120, excerpt: 1500, turn: 1500, historyTurns: 6, minCards: 6, maxCards: 10 } as const

export type Turn = { role: 'user' | 'assistant'; content: string }
export type AiRequest =
  | { kind: 'health' }
  | { kind: 'pack'; topic: string; track: (typeof TRACKS)[number]; cardCount: number }
  | { kind: 'chat'; question: string; packContext?: string; excerpt?: string; history?: Turn[] }

const ALLOWED: Record<AiRequest['kind'], readonly string[]> = {
  health: ['kind'],
  pack: ['kind', 'topic', 'track', 'cardCount'],
  chat: ['kind', 'question', 'packContext', 'excerpt', 'history'],
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number, min = 1): string | null => (typeof v === 'string' && v.trim().length >= min && v.length <= max ? v : null)

export function parseRequest(body: unknown): { ok: true; req: AiRequest } | { ok: false; why: string } {
  if (!isObj(body)) return { ok: false, why: 'body must be an object' }
  const kind = body.kind
  if (kind !== 'health' && kind !== 'pack' && kind !== 'chat') return { ok: false, why: 'unknown kind' }
  const extra = Object.keys(body).filter((k) => !ALLOWED[kind].includes(k))
  if (extra.length) return { ok: false, why: `unexpected field(s): ${extra.join(', ')}` }

  if (kind === 'health') return { ok: true, req: { kind } }

  if (kind === 'pack') {
    const topic = str(body.topic, LIM.topic)
    if (!topic) return { ok: false, why: 'topic' }
    if (!(TRACKS as readonly unknown[]).includes(body.track)) return { ok: false, why: 'track' }
    const n = body.cardCount
    if (typeof n !== 'number' || !Number.isInteger(n) || n < LIM.minCards || n > LIM.maxCards) return { ok: false, why: 'cardCount' }
    return { ok: true, req: { kind, topic, track: body.track as (typeof TRACKS)[number], cardCount: n } }
  }

  const question = str(body.question, LIM.question)
  if (!question) return { ok: false, why: 'question' }
  const req: Extract<AiRequest, { kind: 'chat' }> = { kind, question }
  if (body.packContext !== undefined) {
    const v = str(body.packContext, LIM.packContext)
    if (!v) return { ok: false, why: 'packContext' }
    req.packContext = v
  }
  if (body.excerpt !== undefined) {
    const v = str(body.excerpt, LIM.excerpt)
    if (!v) return { ok: false, why: 'excerpt' }
    req.excerpt = v
  }
  if (body.history !== undefined) {
    if (!Array.isArray(body.history) || body.history.length > LIM.historyTurns) return { ok: false, why: 'history' }
    const turns: Turn[] = []
    for (const t of body.history) {
      if (!isObj(t) || Object.keys(t).some((k) => k !== 'role' && k !== 'content')) return { ok: false, why: 'history turn' }
      const content = str(t.content, LIM.turn)
      if ((t.role !== 'user' && t.role !== 'assistant') || !content) return { ok: false, why: 'history turn' }
      turns.push({ role: t.role, content })
    }
    req.history = turns
  }
  return { ok: true, req }
}
