import { validatePackJson, type ValidPack } from '../packSchema'
import { anonApiKey, functionsUrl, getAccessToken } from '../supabase'
import { buildChatRequest, buildPackRequest } from './payloads'
import type { AiFailure, AiHealth, AiResult, ChatReply, ChatRequest, PackRequest } from './types'

/**
 * THE ONLY MODULE ALLOWED TO CALL fetch. The browser never sees the Groq key: it calls a Supabase Edge
 * Function with the user's session token, and the function holds the key as a server-side secret.
 *
 * Nothing here throws. Nothing here logs keys, headers or request objects.
 */
export interface AiDeps {
  endpoint: string | null
  anonKey: string | null
  getToken: () => Promise<string | null>
  isOnline: () => boolean
  fetchImpl: typeof fetch
  timeoutMs: number
}

const defaults = (timeoutMs: number): AiDeps => ({
  endpoint: functionsUrl('ai'),
  anonKey: anonApiKey(),
  getToken: getAccessToken,
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  fetchImpl: (...a) => fetch(...a),
  timeoutMs,
})

const fail = <T>(reason: AiFailure, detail?: string): AiResult<T> => ({ ok: false, reason, detail })

const REASONS = new Set<string>(['NO_KEY', 'OFFLINE', 'RATE_LIMIT', 'AUTH', 'TIMEOUT', 'SERVER', 'MALFORMED', 'MODEL_RETIRED'])

/** The wire call. Returns the function's `data` payload, or a typed failure. */
async function call(body: { kind: 'pack' | 'chat' | 'health' } & Record<string, unknown>, deps: AiDeps): Promise<AiResult<Record<string, unknown>>> {
  if (!deps.endpoint || !deps.anonKey) return fail('NO_KEY', 'cloud not configured')
  if (!deps.isOnline()) return fail('OFFLINE')
  const token = await deps.getToken()
  if (!token) return fail('AUTH')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs)
  try {
    const res = await deps.fetchImpl(deps.endpoint, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, apikey: deps.anonKey },
      body: JSON.stringify(body),
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      /* non-JSON body: handled by status below */
    }
    const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null

    if (res.ok && obj?.ok === true && obj.data && typeof obj.data === 'object') return { ok: true, data: obj.data as Record<string, unknown> }
    // A structured failure from our function wins over the bare status code.
    const reason = typeof obj?.reason === 'string' && REASONS.has(obj.reason) ? (obj.reason as AiFailure) : null
    if (reason) return fail(reason)
    if (res.status === 401 || res.status === 403) return fail('AUTH')
    if (res.status === 429) return fail('RATE_LIMIT')
    if (res.status === 408 || res.status === 504) return fail('TIMEOUT')
    if (res.status >= 500) return fail('SERVER', `status ${res.status}`)
    return fail(res.ok ? 'MALFORMED' : 'SERVER', `status ${res.status}`)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return fail('TIMEOUT')
    return fail('OFFLINE', 'network error') // a thrown network error means we never reached the function
  } finally {
    clearTimeout(timer)
  }
}

/** Generate a lesson pack. The model's text is VALIDATED with the same validator as seeded packs before anything is returned. */
export async function generatePack(req: PackRequest, deps: AiDeps = defaults(60_000)): Promise<AiResult<ValidPack>> {
  const narrow = buildPackRequest(req) // re-narrow: even a typed caller can't smuggle extra fields through
  if (!narrow) return fail('MALFORMED', 'empty topic')
  const r = await call({ kind: 'pack', topic: narrow.topic, track: narrow.track, cardCount: narrow.cardCount }, deps)
  if (!r.ok) return r
  const content = r.data.content
  if (typeof content !== 'string') return fail('MALFORMED', 'no content')
  const v = validatePackJson(content)
  return v.ok ? { ok: true, data: v.pack } : fail('MALFORMED', v.errors.slice(0, 3).join('; '))
}

export async function askChat(req: ChatRequest, deps: AiDeps = defaults(30_000)): Promise<AiResult<ChatReply>> {
  const narrow = buildChatRequest(req)
  if (!narrow) return fail('MALFORMED', 'empty question')
  const body: { kind: 'chat' } & Record<string, unknown> = { kind: 'chat', question: narrow.question }
  if (narrow.packContext) body.packContext = narrow.packContext
  if (narrow.excerpt) body.excerpt = narrow.excerpt
  if (narrow.history) body.history = narrow.history
  const r = await call(body, deps)
  if (!r.ok) return r
  const reply = r.data.reply
  return typeof reply === 'string' && reply.trim() ? { ok: true, data: { reply: reply.slice(0, 8000) } } : fail('MALFORMED', 'empty reply')
}

/** Is the function reachable, keyed, and are its configured models still served? (Settings → diagnostics.) */
export async function checkAi(deps: AiDeps = defaults(15_000)): Promise<AiResult<AiHealth>> {
  const r = await call({ kind: 'health' }, deps)
  if (!r.ok) return r
  const d = r.data
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return { ok: true, data: { configured: d.configured === true, available: list(d.available), missing: list(d.missing) } }
}
