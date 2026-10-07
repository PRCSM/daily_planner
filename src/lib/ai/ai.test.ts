import { describe, expect, it, vi } from 'vitest'
import { askChat, checkAi, generatePack, type AiDeps } from './client'
import { buildChatRequest, buildPackRequest } from './payloads'
import { AI_FAILURES, AI_MESSAGES, LIMITS } from './types'

/** A fully-populated fixture: every sensitive COLUMN the app stores, with distinctive values. */
// NOTE: `topic` (pack topic) and `role` (chat turn role) are LEGITIMATE payload keys that happen to share a name with
// a database column; they are covered by the exact key-set assertions below, and their sensitive VALUES are checked.
const SENSITIVE_COLUMNS = ['sleepHours', 'energy', 'trained', 'applicationsSent', 'conceptsLearned', 'shipped', 'blockers', 'company', 'appliedDate', 'nextFollowUp', 'resumeVariant', 'followUpEventId', 'aiUsed', 'minutes', 'notes', 'userModified', 'deletedAt', 'syncedAt', 'weekNumber', 'phase', 'logId', 'dayId', 'intention', 'status', 'reviewDue', 'solvedDate', 'q5FuelOk', 'burnoutFlag', 'email', 'userId', 'user_id', 'access_token']
const SENSITIVE_VALUES = ['Acme Corp', 'SDE-1 Backend', '5.5-hours-slept', 'secret-shipped-line', 'blocker-text-xyz', 'resume-variant-77', 'person@example.com']

const fatRow = {
  id: 'row-1', createdAt: 'x', updatedAt: 'x', deletedAt: null, syncedAt: null, userModified: false, seeded: false,
  sleepHours: 5.5, energy: 2, trained: true, applicationsSent: 4, conceptsLearned: ['x'], shipped: 'secret-shipped-line', blockers: 'blocker-text-xyz',
  company: 'Acme Corp', role: 'SDE-1 Backend', appliedDate: '2026-08-01', nextFollowUp: '2026-08-08', resumeVariant: 'resume-variant-77', followUpEventId: 'e',
  aiUsed: true, minutes: 90, notes: 'private notes', weekNumber: 4, phase: 'GET_PRESENTABLE', logId: 'l', dayId: 'd', intention: 'private intention',
  status: 'APPLIED', reviewDue: '2026-08-09', solvedDate: '2026-08-02', q5FuelOk: false, burnoutFlag: true, email: 'person@example.com', userId: 'u', user_id: 'u', access_token: 'tok', sleep: '5.5-hours-slept',
}

describe('data minimisation — the rule that matters most', () => {
  it('buildPackRequest keeps ONLY topic/track/cardCount, even when handed a whole database row', () => {
    const r = buildPackRequest({ ...fatRow, topic: 'Union-Find', track: 'DSA', cardCount: 8 })!
    expect(Object.keys(r).sort()).toEqual(['cardCount', 'topic', 'track'])
    const s = JSON.stringify(r)
    for (const col of SENSITIVE_COLUMNS) expect(s, col).not.toContain(`"${col}"`)
    for (const v of SENSITIVE_VALUES) expect(s, v).not.toContain(v)
  })

  it('buildChatRequest keeps ONLY question/packContext/excerpt/history{role,content}, even when handed rows', () => {
    const r = buildChatRequest({ ...fatRow, question: 'why?', packContext: 'Closures', excerpt: 'A closure is…', history: [{ ...fatRow, role: 'user', content: 'hi' }, { ...fatRow, role: 'assistant', content: 'hello' }] })!
    expect(Object.keys(r).sort()).toEqual(['excerpt', 'history', 'packContext', 'question'])
    for (const t of r.history!) expect(Object.keys(t).sort()).toEqual(['content', 'role'])
    const s = JSON.stringify(r)
    for (const col of SENSITIVE_COLUMNS) expect(s, col).not.toContain(`"${col}"`)
    for (const v of SENSITIVE_VALUES) expect(s, v).not.toContain(v)
  })

  it('the ACTUAL wire body never contains a sensitive column name or value (spread-a-row cannot leak)', async () => {
    const bodies: string[] = []
    const deps = mkDeps({ fetchImpl: (async (_u: string, init: RequestInit) => (bodies.push(String(init.body)), new Response(JSON.stringify({ ok: true, data: { reply: 'ok', content: PACK } }), { status: 200 }))) as unknown as typeof fetch })
    await askChat({ ...fatRow, question: 'why?', history: [{ ...fatRow, role: 'user', content: 'hi' }] } as never, deps)
    await generatePack({ ...fatRow, topic: 'DP', track: 'DSA', cardCount: 8 } as never, deps)
    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      for (const col of SENSITIVE_COLUMNS) expect(body, col).not.toContain(`"${col}"`)
      for (const v of SENSITIVE_VALUES) expect(body, v).not.toContain(v)
    }
    expect(Object.keys(JSON.parse(bodies[0]!)).sort()).toEqual(['history', 'kind', 'question'])
    expect(Object.keys(JSON.parse(bodies[1]!)).sort()).toEqual(['cardCount', 'kind', 'topic', 'track'])
  })

  it('clips, trims and clamps what it keeps', () => {
    expect(buildPackRequest({ topic: '  a\n\n b  ', track: 'NOPE', cardCount: 99 })).toEqual({ topic: 'a b', track: 'GENERAL', cardCount: LIMITS.maxCards })
    expect(buildPackRequest({ topic: 'x', cardCount: 1 })!.cardCount).toBe(LIMITS.minCards)
    expect(buildPackRequest({ topic: 'x', cardCount: 'abc' })!.cardCount).toBe(8)
    expect(buildPackRequest({ topic: 'x'.repeat(500) })!.topic).toHaveLength(LIMITS.topic)
    expect(buildPackRequest({ topic: '   ' })).toBeNull()
    const long = buildChatRequest({ question: 'q'.repeat(5000), excerpt: 'e'.repeat(5000), history: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `m${i}` })) })!
    expect(long.question).toHaveLength(LIMITS.question)
    expect(long.excerpt).toHaveLength(LIMITS.excerpt)
    expect(long.history).toHaveLength(LIMITS.historyTurns)
    expect(long.history!.at(-1)!.content).toBe('m19') // the most recent turns are kept
    expect(buildChatRequest({ question: '' })).toBeNull()
    expect(buildChatRequest({ question: 'q', history: [{ role: 'system', content: 'x' }, { role: 'user', content: '' }, null] })!.history).toBeUndefined()
  })
})

const PACK = JSON.stringify({ title: 'T', summary: 'S', cards: ['HOOK', 'CONCEPT', 'CODE', 'SUMMARY'].map((type, i) => ({ orderIndex: i, type, body: 'b', ...(type === 'CODE' ? { codeSnippet: 'x' } : {}) })) })
function mkDeps(over: Partial<AiDeps> = {}): AiDeps {
  return {
    endpoint: 'https://proj.supabase.co/functions/v1/ai',
    anonKey: 'anon-public-key',
    getToken: async () => 'user-session-token',
    isOnline: () => true,
    fetchImpl: (async () => new Response(JSON.stringify({ ok: true, data: { content: 'hi' } }), { status: 200 })) as unknown as typeof fetch,
    timeoutMs: 60,
    ...over,
  }
}
const respond = (status: number, body: unknown) => mkDeps({ fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch })

describe('every AI function returns a discriminated result — never throws', () => {
  it('has a distinct, specific message for every failure reason (MODEL_RETIRED is not "server error")', () => {
    expect(new Set(AI_FAILURES.map((r) => AI_MESSAGES[r])).size).toBe(AI_FAILURES.length)
    expect(AI_MESSAGES.MODEL_RETIRED).toMatch(/retired/i)
    expect(AI_MESSAGES.MODEL_RETIRED).toMatch(/configuration/i)
    expect(AI_MESSAGES.MODEL_RETIRED).not.toBe(AI_MESSAGES.SERVER)
    expect(AI_MESSAGES.OFFLINE).toMatch(/offline/i)
  })

  it('success', async () => {
    expect(await askChat({ question: 'hi' }, mkDeps())).toEqual({ ok: true, data: { reply: 'hi' } })
  })

  it('NO_KEY when cloud isn’t configured (nothing is called)', async () => {
    const f = vi.fn()
    expect(await askChat({ question: 'x' }, mkDeps({ endpoint: null, fetchImpl: f as never }))).toMatchObject({ ok: false, reason: 'NO_KEY' })
    expect(await askChat({ question: 'x' }, mkDeps({ anonKey: null, fetchImpl: f as never }))).toMatchObject({ ok: false, reason: 'NO_KEY' })
    expect(f).not.toHaveBeenCalled()
  })
  it('OFFLINE when the browser says so — without attempting the request', async () => {
    const f = vi.fn()
    expect(await askChat({ question: 'x' }, mkDeps({ isOnline: () => false, fetchImpl: f as never }))).toMatchObject({ ok: false, reason: 'OFFLINE' })
    expect(f).not.toHaveBeenCalled()
  })
  it('OFFLINE when the request itself fails to connect', async () => {
    expect(await askChat({ question: 'x' }, mkDeps({ fetchImpl: (async () => { throw new TypeError('Failed to reach') }) as never }))).toMatchObject({ ok: false, reason: 'OFFLINE' })
  })
  it('AUTH when signed out, or on 401/403', async () => {
    expect(await askChat({ question: 'x' }, mkDeps({ getToken: async () => null }))).toMatchObject({ reason: 'AUTH' })
    expect(await askChat({ question: 'x' }, respond(401, {}))).toMatchObject({ reason: 'AUTH' })
    expect(await askChat({ question: 'x' }, respond(403, 'nope'))).toMatchObject({ reason: 'AUTH' })
  })
  it('RATE_LIMIT, TIMEOUT, SERVER by status', async () => {
    expect(await askChat({ question: 'x' }, respond(429, {}))).toMatchObject({ reason: 'RATE_LIMIT' })
    expect(await askChat({ question: 'x' }, respond(504, {}))).toMatchObject({ reason: 'TIMEOUT' })
    expect(await askChat({ question: 'x' }, respond(500, {}))).toMatchObject({ reason: 'SERVER' })
    expect(await askChat({ question: 'x' }, respond(502, 'html error page'))).toMatchObject({ reason: 'SERVER' })
  })
  it('a structured reason from the function wins over the bare status', async () => {
    expect(await askChat({ question: 'x' }, respond(503, { ok: false, reason: 'MODEL_RETIRED' }))).toMatchObject({ reason: 'MODEL_RETIRED' })
    expect(await askChat({ question: 'x' }, respond(503, { ok: false, reason: 'NO_KEY' }))).toMatchObject({ reason: 'NO_KEY' })
    expect(await askChat({ question: 'x' }, respond(502, { ok: false, reason: 'made-up' }))).toMatchObject({ reason: 'SERVER' }) // unknown reasons are not trusted
  })
  it('TIMEOUT when the call hangs past the deadline (aborts it)', async () => {
    let aborted = false
    const deps = mkDeps({ timeoutMs: 20, fetchImpl: ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => ((aborted = true), rej(new DOMException('aborted', 'AbortError')))))) as never })
    expect(await askChat({ question: 'x' }, deps)).toMatchObject({ ok: false, reason: 'TIMEOUT' })
    expect(aborted).toBe(true)
  })
  it('MALFORMED for a 200 that isn’t our shape, an empty reply, or an empty question', async () => {
    expect(await askChat({ question: 'x' }, respond(200, { hello: 1 }))).toMatchObject({ reason: 'MALFORMED' })
    expect(await askChat({ question: 'x' }, respond(200, { ok: true, data: { content: '  ' } }))).toMatchObject({ reason: 'MALFORMED' })
    expect(await askChat({ question: ' ' }, mkDeps())).toMatchObject({ reason: 'MALFORMED' })
    expect(await generatePack({ topic: '  ', track: 'DSA', cardCount: 8 }, mkDeps())).toMatchObject({ reason: 'MALFORMED' })
  })
  it('sends the session token + anon key as headers and JSON as the body', async () => {
    const seen: RequestInit[] = []
    await askChat({ question: 'x' }, mkDeps({ fetchImpl: (async (_u: string, i: RequestInit) => (seen.push(i), new Response(JSON.stringify({ ok: true, data: { content: 'r' } })))) as never }))
    const h = seen[0]!.headers as Record<string, string>
    expect(h.authorization).toBe('Bearer user-session-token')
    expect(h.apikey).toBe('anon-public-key')
    expect(seen[0]!.method).toBe('POST')
  })
  it('caps an absurdly long reply', async () => {
    const r = await askChat({ question: 'x' }, respond(200, { ok: true, data: { content: 'a'.repeat(50000) } }))
    expect(r.ok && r.data.reply.length).toBe(8000)
  })
})

describe('generatePack validates before returning', () => {
  const ok = (content: string) => respond(200, { ok: true, data: { content } })
  it('returns a validated pack', async () => {
    const r = await generatePack({ topic: 'DP', track: 'DSA', cardCount: 6 }, ok(PACK))
    expect(r.ok && r.data.cards).toHaveLength(4)
  })
  it('accepts fenced JSON and prose around it', async () => {
    expect((await generatePack({ topic: 'x', track: 'DSA', cardCount: 6 }, ok('```json\n' + PACK + '\n```'))).ok).toBe(true)
    expect((await generatePack({ topic: 'x', track: 'DSA', cardCount: 6 }, ok('Here you go:\n' + PACK))).ok).toBe(true)
  })
  it('REJECTS rather than writes garbage: bad JSON, unknown card type, non-contiguous order, too many cards, over-long card', async () => {
    const mut = (f: (p: any) => void) => { const p = JSON.parse(PACK); f(p); return JSON.stringify(p) }
    const bad = [
      'not json at all',
      mut((p) => (p.cards[1].type = 'POEM')),
      mut((p) => (p.cards[2].orderIndex = 9)),
      mut((p) => (p.cards = Array.from({ length: 13 }, (_, i) => ({ orderIndex: i, type: i === 0 ? 'HOOK' : i === 12 ? 'SUMMARY' : 'CONCEPT', body: 'b' })))),
      mut((p) => (p.cards[1].body = 'x'.repeat(2001))),
      mut((p) => (p.cards[0].type = 'CONCEPT')),
      mut((p) => delete p.cards[2].codeSnippet),
    ]
    for (const b of bad) expect(await generatePack({ topic: 'x', track: 'DSA', cardCount: 6 }, ok(b)), b.slice(0, 40)).toMatchObject({ ok: false, reason: 'MALFORMED' })
    expect(await generatePack({ topic: 'x', track: 'DSA', cardCount: 6 }, respond(200, { ok: true, data: {} }))).toMatchObject({ reason: 'MALFORMED' })
  })
})

describe('checkAi', () => {
  it('reports configured + which models are available / missing', async () => {
    const r = await checkAi(respond(200, { ok: true, data: { configured: true, available: ['a'], missing: ['b', 3] } }))
    expect(r).toEqual({ ok: true, data: { configured: true, available: ['a'], missing: ['b'] } })
  })
  it('surfaces failures', async () => {
    expect(await checkAi(respond(503, { ok: false, reason: 'NO_KEY' }))).toMatchObject({ reason: 'NO_KEY' })
  })
})
