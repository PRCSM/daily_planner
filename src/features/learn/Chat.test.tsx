import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ChatScreen } from './ChatScreen'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { freshDbPerTest } from '@/test/db'
import type { AiDeps } from '@/lib/ai'

freshDbPerTest()
beforeEach(async () => {
  await ensureSeeded()
})
afterEach(() => vi.restoreAllMocks())

const PACK = JSON.stringify({ title: 'Union-Find', summary: 'Disjoint sets.', cards: ['HOOK', 'CONCEPT', 'CODE', 'CHECK', 'SUMMARY'].map((type, i) => ({ orderIndex: i, type, heading: type, body: type === 'CHECK' ? 'Q: x\n\nA: y' : 'body', ...(type === 'CODE' ? { codeSnippet: 'parent = list(range(n))', codeLang: 'python' } : {}) })) })

function mk(respond: (body: any) => Response | Promise<Response>) {
  const bodies: any[] = []
  const deps: AiDeps = {
    endpoint: 'https://p.supabase.co/functions/v1/ai',
    anonKey: 'anon',
    getToken: async () => 'tok',
    isOnline: () => true,
    timeoutMs: 1000,
    fetchImpl: (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      bodies.push(body)
      return respond(body)
    }) as unknown as typeof fetch,
  }
  return { deps, bodies }
}
const ok = (data: object) => new Response(JSON.stringify({ ok: true, data }), { status: 200 })
const bad = (status: number, reason: string) => new Response(JSON.stringify({ ok: false, reason }), { status })

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname}</div>
}
const ui = (deps: AiDeps, url = '/learn/chat') => (
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/learn/chat" element={<><ChatScreen deps={deps} /><Where /></>} />
      <Route path="/learn/pack/:id" element={<Where />} />
      <Route path="/learn" element={<Where />} />
    </Routes>
  </MemoryRouter>
)

describe('Chat', () => {
  it('sends a question, stores both messages, and renders the answer', async () => {
    const u = userEvent.setup()
    const { deps, bodies } = mk(() => ok({ reply: 'Because of **path compression**.' }))
    render(ui(deps))
    await u.type(screen.getByLabelText('Your question'), 'why is find fast?{Enter}')
    expect(await screen.findByText('path compression')).toBeInTheDocument()
    expect(bodies[0]).toEqual({ kind: 'chat', question: 'why is find fast?' })
    expect((await db.chatMessages.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((m) => [m.role, m.content])).toEqual([['user', 'why is find fast?'], ['assistant', 'Because of **path compression**.']])
    expect(screen.getByLabelText('Your question')).toHaveValue('')
  })

  it('model output is TEXT: HTML, scripts and links in a reply are never rendered as elements', async () => {
    const u = userEvent.setup()
    const { deps } = mk(() => ok({ reply: '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"> [click](javascript:alert(1)) **ok**' }))
    const { container } = render(ui(deps))
    await u.type(screen.getByLabelText('Your question'), 'x{Enter}')
    const list = await screen.findByRole('list', { name: 'Messages' })
    await waitFor(() => expect(within(list).getByText('ok')).toBeInTheDocument())
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(list.textContent).toContain('<script>window.__pwned=1</script>') // visible as literal text
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('from a card: sends ONLY the pack title + that card’s excerpt, and history as role+content', async () => {
    const u = userEvent.setup()
    const pack = (await db.contentPacks.toArray()).find((p) => p.title === 'Closures')!
    const { deps, bodies } = mk(() => ok({ reply: 'r' }))
    render(ui(deps, `/learn/chat?pack=${pack.id}&card=0`))
    expect(await screen.findByText(/About: Closures · card 1/)).toBeInTheDocument()
    await u.type(screen.getByLabelText('Your question'), 'first{Enter}')
    await waitFor(() => expect(bodies).toHaveLength(1))
    await u.type(screen.getByLabelText('Your question'), 'second{Enter}')
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(Object.keys(bodies[0]).sort()).toEqual(['excerpt', 'kind', 'packContext', 'question'])
    expect(bodies[0].packContext).toBe('Closures')
    expect(bodies[0].excerpt).toMatch(/Why does this print 3, 3, 3\?/)
    expect(bodies[1].history.map((t: any) => Object.keys(t).sort())).toEqual([['content', 'role'], ['content', 'role']])
    expect(JSON.stringify(bodies)).not.toMatch(/"(id|createdAt|updatedAt|threadId|seeded)"/)
  })

  const reasons: [string, number, string][] = [['RATE_LIMIT', 429, 'RATE_LIMIT'], ['MODEL_RETIRED', 503, 'MODEL_RETIRED'], ['NO_KEY', 503, 'NO_KEY'], ['SERVER', 502, 'SERVER'], ['TIMEOUT', 504, 'TIMEOUT']]
  for (const [reason, status] of reasons) {
    it(`a ${reason} failure shows its own specific message and stores no assistant message`, async () => {
      const u = userEvent.setup()
      const { deps } = mk(() => bad(status, reason))
      render(ui(deps))
      await u.type(screen.getByLabelText('Your question'), 'hello{Enter}')
      const err = await screen.findByTestId('ai-error')
      expect(err).toHaveAttribute('data-reason', reason)
      expect((await db.chatMessages.toArray()).map((m) => m.role)).toEqual(['user'])
    })
  }

  it('MODEL_RETIRED is explained as configuration, not as a network problem', async () => {
    const u = userEvent.setup()
    render(ui(mk(() => bad(503, 'MODEL_RETIRED')).deps))
    await u.type(screen.getByLabelText('Your question'), 'hi{Enter}')
    expect(await screen.findByTestId('ai-error')).toHaveTextContent(/configuration problem, not a network one/)
  })

  it('offline: a clear banner, input and Send disabled — and nothing is attempted', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { deps, bodies } = mk(() => ok({ reply: 'x' }))
    render(ui(deps))
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(await screen.findByTestId('offline-banner')).toHaveTextContent(/offline/i)
    expect(screen.getByLabelText('Your question')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(bodies).toHaveLength(0)
  })

  it('history lists chats and can reopen or delete them', async () => {
    const u = userEvent.setup()
    const { deps } = mk(() => ok({ reply: 'a' }))
    render(ui(deps))
    await u.type(screen.getByLabelText('Your question'), 'remember me{Enter}')
    await screen.findByText('a')
    await u.click(screen.getByRole('button', { name: 'New chat' }))
    expect(within(screen.getByRole('list', { name: 'Messages' })).queryByText('remember me')).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Chat history' }))
    await u.click(await screen.findByRole('button', { name: 'remember me' }))
    expect(await screen.findByText('a')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Chat history' }))
    await u.click(await screen.findByRole('button', { name: 'Delete chat remember me' }))
    await waitFor(async () => expect((await db.chatThreads.toArray()).filter((t) => !t.deletedAt)).toHaveLength(0))
  })
})

describe('Generate a pack', () => {
  async function openGen(u: ReturnType<typeof userEvent.setup>) {
    await u.click(await screen.findByRole('button', { name: /Generate a pack from a topic/ }))
  }

  it('saves a VALIDATED pack (pack + cards) and opens it in the reader', async () => {
    const u = userEvent.setup()
    const { deps, bodies } = mk(() => ok({ content: PACK, model: 'm' }))
    render(ui(deps))
    await openGen(u)
    await u.type(screen.getByLabelText('Pack topic'), 'Union-Find')
    await u.click(screen.getByRole('button', { name: 'DSA' }))
    await u.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/learn\/pack\//))
    expect(bodies[0]).toEqual({ kind: 'pack', topic: 'Union-Find', track: 'DSA', cardCount: 8 })
    const p = (await db.contentPacks.toArray()).find((x) => x.source === 'AI_GENERATED')!
    expect(p).toMatchObject({ title: 'Union-Find', totalCards: 5, topic: 'Union-Find', track: 'DSA', tags: ['union', 'find'] })
    expect((await db.contentCards.where('packId').equals(p.id).toArray()).map((c) => c.orderIndex).sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('REJECTS an invalid pack: nothing is written, and the user is told why', async () => {
    const u = userEvent.setup()
    const broken = JSON.stringify({ title: 'x', summary: 's', cards: [{ orderIndex: 0, type: 'POEM', body: 'b' }] })
    const before = await db.contentPacks.count()
    render(ui(mk(() => ok({ content: broken })).deps))
    await openGen(u)
    await u.type(screen.getByLabelText('Pack topic'), 'Tries')
    await u.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByTestId('gen-error')).toHaveAttribute('data-reason', 'MALFORMED')
    expect(await db.contentPacks.count()).toBe(before)
    expect(screen.getByTestId('where')).toHaveTextContent('/learn/chat')
  })

  it('a failure (rate limit) writes nothing and shows its reason', async () => {
    const u = userEvent.setup()
    const before = await db.contentPacks.count()
    render(ui(mk(() => bad(429, 'RATE_LIMIT')).deps))
    await openGen(u)
    await u.type(screen.getByLabelText('Pack topic'), 'Heaps')
    await u.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByTestId('gen-error')).toHaveAttribute('data-reason', 'RATE_LIMIT')
    expect(await db.contentPacks.count()).toBe(before)
  })
})
