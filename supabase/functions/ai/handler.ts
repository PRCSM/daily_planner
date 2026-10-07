import { GROQ_BASE, modelsFrom } from './models.ts'
import { chatMessages, packMessages, type Msg } from './prompts.ts'
import { MAX_BODY_BYTES, parseRequest, type AiRequest } from './validate.ts'

/**
 * The AI Edge Function core. Pure of Deno APIs (env, fetch and the clock are injected) so it is unit-tested with
 * vitest. The Groq key exists ONLY here, as a server-side secret: it is never returned, logged, or sent anywhere
 * but api.groq.com. We never log headers, request bodies, or response bodies — only status codes.
 */
export interface Env {
  GROQ_API_KEY?: string
  GROQ_MODELS?: string
  ALLOWED_ORIGIN?: string
}
export interface Deps {
  env: Env
  fetchImpl: typeof fetch
  now: () => number
  /** Per-user sliding window. Injected so tests can reset it. */
  hits?: Map<string, number[]>
  timeoutMs?: number
}

type Failure = 'NO_KEY' | 'OFFLINE' | 'RATE_LIMIT' | 'AUTH' | 'TIMEOUT' | 'SERVER' | 'MALFORMED' | 'MODEL_RETIRED'
const STATUS: Record<Failure, number> = { NO_KEY: 503, OFFLINE: 503, RATE_LIMIT: 429, AUTH: 401, TIMEOUT: 504, SERVER: 502, MALFORMED: 400, MODEL_RETIRED: 503 }

export const RATE = { windowMs: 60_000, chat: 20, pack: 5, health: 10 } as const
const sharedHits = new Map<string, number[]>()

function cors(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}
function json(env: Env, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(env) } })
}
const failure = (env: Env, reason: Failure, extra: Record<string, unknown> = {}) => json(env, STATUS[reason], { ok: false, reason, ...extra })

/** The JWT was already verified by the Supabase gateway (verify_jwt); we only read `sub` to key the rate limiter. */
export function userIdFrom(authorization: string | null): string | null {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1]
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const sub = (JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub ? sub : null
  } catch {
    return null
  }
}

function limited(hits: Map<string, number[]>, key: string, max: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE.windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)
  return false
}

interface GroqOk {
  ok: true
  content: string
}
interface GroqErr {
  ok: false
  reason: Failure
}

const isRetired = (status: number, code: unknown, message: unknown): boolean =>
  status === 404 || (status === 400 && typeof code === 'string' && /model_(decommissioned|not_found|terminated|not_active)/.test(code)) || (typeof message === 'string' && /decommission|no longer supported|does not exist|has been deprecated/i.test(message))

async function callGroq(deps: Deps, model: string, messages: Msg[], opts: { json: boolean; maxTokens: number }): Promise<GroqOk | GroqErr> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? 40_000)
  const body: Record<string, unknown> = { model, messages, temperature: 0.4, max_completion_tokens: opts.maxTokens, stream: false }
  if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low'
  if (opts.json) body.response_format = { type: 'json_object' }
  try {
    let res = await deps.fetchImpl(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.env.GROQ_API_KEY}` },
      body: JSON.stringify(body),
    })
    // Some models reject response_format: retry once without it (the validator is the real guard).
    if (res.status === 400 && opts.json) {
      const peek = (await res.clone().json().catch(() => null)) as { error?: { message?: string } } | null
      if (/response_format/i.test(peek?.error?.message ?? '')) {
        delete body.response_format
        res = await deps.fetchImpl(`${GROQ_BASE}/chat/completions`, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${deps.env.GROQ_API_KEY}` }, body: JSON.stringify(body) })
      }
    }
    const data = (await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown }; choices?: { message?: { content?: unknown } }[] } | null
    if (!res.ok) {
      if (isRetired(res.status, data?.error?.code, data?.error?.message)) return { ok: false, reason: 'MODEL_RETIRED' }
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'NO_KEY' } // the SERVER's key is bad or revoked
      if (res.status === 429) return { ok: false, reason: 'RATE_LIMIT' }
      if (res.status === 408 || res.status === 504) return { ok: false, reason: 'TIMEOUT' }
      return { ok: false, reason: res.status >= 500 ? 'SERVER' : 'MALFORMED' }
    }
    const content = data?.choices?.[0]?.message?.content
    return typeof content === 'string' && content.trim() ? { ok: true, content } : { ok: false, reason: 'MALFORMED' }
  } catch (e) {
    // Match on the name, not `instanceof`: a DOMException from another realm (jsdom, an iframe) is not an Error here.
    if (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError') return { ok: false, reason: 'TIMEOUT' }
    return { ok: false, reason: 'SERVER' }
  } finally {
    clearTimeout(timer)
  }
}

/** Try each configured model in order; only a RETIRED model moves on to the next. */
async function complete(deps: Deps, messages: Msg[], opts: { json: boolean; maxTokens: number }): Promise<Response> {
  let lastReason: Failure = 'MODEL_RETIRED'
  for (const model of modelsFrom(deps.env)) {
    const r = await callGroq(deps, model, messages, opts)
    if (r.ok) return json(deps.env, 200, { ok: true, data: { content: r.content, model } })
    lastReason = r.reason
    if (r.reason !== 'MODEL_RETIRED') break
  }
  return failure(deps.env, lastReason)
}

async function health(deps: Deps): Promise<Response> {
  try {
    const res = await deps.fetchImpl(`${GROQ_BASE}/models`, { headers: { authorization: `Bearer ${deps.env.GROQ_API_KEY}` } })
    if (res.status === 401 || res.status === 403) return failure(deps.env, 'NO_KEY')
    if (!res.ok) return failure(deps.env, 'SERVER')
    const d = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
    const served = new Set((d?.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === 'string'))
    const configured = modelsFrom(deps.env)
    return json(deps.env, 200, { ok: true, data: { configured: true, available: configured.filter((m) => served.has(m)), missing: configured.filter((m) => !served.has(m)) } })
  } catch {
    return failure(deps.env, 'SERVER')
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { env } = deps
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
  if (req.method !== 'POST') return failure(env, 'MALFORMED', { detail: 'POST only' })

  const user = userIdFrom(req.headers.get('authorization'))
  if (!user) return failure(env, 'AUTH')

  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return failure(env, 'MALFORMED', { detail: 'body too large' })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return failure(env, 'MALFORMED', { detail: 'invalid JSON' })
  }
  const parsed = parseRequest(body)
  if (!parsed.ok) return failure(env, 'MALFORMED', { detail: parsed.why })
  return run(deps, user, parsed.req)
}

/**
 * Everything after authentication and parsing: key check, per-user rate limit, dispatch. Exported so the browser can
 * run the SAME logic in "direct" mode (see src/lib/ai/client.ts) instead of re-implementing validation and fallback.
 */
export async function run(deps: Deps, user: string, r: AiRequest): Promise<Response> {
  const { env } = deps
  if (!env.GROQ_API_KEY) return failure(env, 'NO_KEY')
  if (limited(deps.hits ?? sharedHits, `${user}|${r.kind}`, RATE[r.kind], deps.now())) return failure(env, 'RATE_LIMIT')

  if (r.kind === 'health') return health(deps)
  if (r.kind === 'pack') return complete(deps, packMessages(r.topic, r.track, r.cardCount), { json: true, maxTokens: 6000 })
  return complete(deps, chatMessages(r.question, r.packContext, r.excerpt, r.history), { json: false, maxTokens: 1200 })
}
