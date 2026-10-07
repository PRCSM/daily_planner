import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiMode, askChat, checkAi, generatePack, type AiDeps } from './client'

/** DIRECT mode: the build was given a Groq key and the browser runs the Edge Function's own handler itself. */
const KEY = 'test-direct-key-0123456789'
const GROQ = 'https://api.groq.com/openai/v1'
const PACK = JSON.stringify({ title: 'Union-Find', summary: 'Disjoint sets.', cards: ['HOOK', 'CONCEPT', 'CODE', 'CHECK', 'SUMMARY'].map((type, i) => ({ orderIndex: i, type, heading: type, body: type === 'CHECK' ? 'Q: x\n\nA: y' : 'body', ...(type === 'CODE' ? { codeSnippet: 'parent = list(range(n))', codeLang: 'python' } : {}) })) })

const groqOk = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
const groqErr = (status: number, error: Record<string, unknown> = {}) => new Response(JSON.stringify({ error }), { status })

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }
function direct(responder: (call: Call, n: number) => Response | Promise<Response>, over: Partial<AiDeps> = {}) {
  const calls: Call[] = []
  const getToken = vi.fn(async () => 'must-not-be-needed')
  const deps: AiDeps = {
    directKey: KEY,
    endpoint: null, // the cloud is NOT configured: direct mode must not need it
    anonKey: null,
    getToken,
    isOnline: () => true,
    timeoutMs: 80,
    fetchImpl: (async (url: string, init: RequestInit) => {
      const call: Call = { url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : {} }
      calls.push(call)
      if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return responder(call, calls.length)
    }) as unknown as typeof fetch,
    ...over,
  }
  return { deps, calls, getToken }
}

afterEach(() => vi.unstubAllEnvs())

describe('direct mode (a build-time Groq key; no Supabase, no sign-in)', () => {
  it('chat: one call, straight to Groq, with the key — and no cloud configuration or session token needed', async () => {
    const { deps, calls, getToken } = direct(() => groqOk('A closure remembers its scope.'))
    const r = await askChat({ question: 'What is a closure?', packContext: 'Closures' }, deps)
    expect(r).toEqual({ ok: true, data: { reply: 'A closure remembers its scope.' } })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(`${GROQ}/chat/completions`)
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(calls[0]!.body.model).toBe('openai/gpt-oss-120b')
    expect(JSON.stringify(calls[0]!.body.messages)).toContain('What is a closure?')
    expect(getToken).not.toHaveBeenCalled()
  })

  it('pack generation: the model’s text is validated before it is returned', async () => {
    const { deps, calls } = direct(() => groqOk(PACK))
    const r = await generatePack({ topic: 'Union-Find', track: 'DSA', cardCount: 8 }, deps)
    expect(r.ok && r.data.cards.map((c) => c.type)).toEqual(['HOOK', 'CONCEPT', 'CODE', 'CHECK', 'SUMMARY'])
    expect(calls[0]!.body.response_format).toEqual({ type: 'json_object' })
    const bad = direct(() => groqOk('{"title":"x"}'))
    expect(await generatePack({ topic: 'x', track: 'GENERAL', cardCount: 8 }, bad.deps)).toMatchObject({ ok: false, reason: 'MALFORMED' })
  })

  it('falls back to the second model ONLY when the first has been retired', async () => {
    const { deps, calls } = direct((_c, n) => (n === 1 ? groqErr(400, { code: 'model_decommissioned', message: 'The model has been decommissioned' }) : groqOk('from the fallback')))
    expect(await askChat({ question: 'hi' }, deps)).toEqual({ ok: true, data: { reply: 'from the fallback' } })
    expect(calls.map((c) => c.body.model)).toEqual(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'])
    const both = direct(() => groqErr(404, { message: 'model does not exist' }))
    expect(await askChat({ question: 'hi' }, both.deps)).toMatchObject({ ok: false, reason: 'MODEL_RETIRED' })
    const rate = direct(() => groqErr(429))
    expect(await askChat({ question: 'hi' }, rate.deps)).toMatchObject({ ok: false, reason: 'RATE_LIMIT' })
    expect(rate.calls).toHaveLength(1) // a rate limit does not burn the fallback model
  })

  it('maps every failure to the right reason', async () => {
    expect(await askChat({ question: 'x' }, direct(() => groqErr(401)).deps)).toMatchObject({ reason: 'NO_KEY' }) // Groq rejected the key
    expect(await askChat({ question: 'x' }, direct(() => groqErr(500)).deps)).toMatchObject({ reason: 'SERVER' })
    expect(await askChat({ question: 'x' }, direct(() => groqOk('   ')).deps)).toMatchObject({ reason: 'MALFORMED' })
    const offline = direct(() => groqOk('x'), { isOnline: () => false })
    expect(await askChat({ question: 'x' }, offline.deps)).toMatchObject({ reason: 'OFFLINE' })
    expect(offline.calls).toHaveLength(0)
    const hang = direct(() => new Promise<Response>(() => {}), { timeoutMs: 30, fetchImpl: ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as never })
    expect(await askChat({ question: 'x' }, hang.deps)).toMatchObject({ reason: 'TIMEOUT' })
  })

  it('rejects an oversized or malformed request locally, before any network call', async () => {
    const { deps, calls } = direct(() => groqOk('x'))
    expect(await askChat({ question: '' }, deps)).toMatchObject({ reason: 'MALFORMED' })
    expect(calls).toHaveLength(0)
  })

  it('the health check lists which pinned models Groq still serves', async () => {
    const { deps, calls } = direct(() => new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }] }), { status: 200 }))
    const r = await checkAi(deps)
    expect(r).toEqual({ ok: true, data: { configured: true, available: ['openai/gpt-oss-120b'], missing: ['llama-3.3-70b-versatile'] } })
    expect(calls[0]!.url).toBe(`${GROQ}/models`)
  })

  it('the key never appears in anything returned to the app — success, failure or diagnostics', async () => {
    const outs = [
      await askChat({ question: 'x' }, direct(() => groqOk('fine')).deps),
      await askChat({ question: 'x' }, direct(() => groqErr(401, { message: `invalid key ${KEY}` })).deps),
      await askChat({ question: 'x' }, direct(() => groqErr(500, { message: `boom ${KEY}` })).deps),
      await generatePack({ topic: 'x', track: 'GENERAL', cardCount: 8 }, direct(() => groqOk(PACK)).deps),
      await checkAi(direct(() => new Response(JSON.stringify({ data: [] }), { status: 200 })).deps),
    ]
    for (const o of outs) expect(JSON.stringify(o)).not.toContain(KEY)
  })

  it('is on only when the build supplied a key; blank or whitespace means the cloud path', () => {
    vi.stubEnv('VITE_GROQ_API_KEY', '')
    expect(aiMode()).toBe('cloud')
    vi.stubEnv('VITE_GROQ_API_KEY', '   ')
    expect(aiMode()).toBe('cloud')
    vi.stubEnv('VITE_GROQ_API_KEY', KEY)
    expect(aiMode()).toBe('direct')
  })
})
