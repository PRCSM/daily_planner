import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { LearnScreen } from './LearnScreen'
import { PackReader } from './PackReader'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { quoteForDate } from '@/domain/quotes'
import { freshDbPerTest } from '@/test/db'
import { setClockSource, localDate } from '@/lib/clock'
import { T0 } from '@/test/factories'
import { addDays } from '@/domain/dates'

freshDbPerTest()
beforeEach(async () => {
  await ensureSeeded()
})

const learn = () => (
  <MemoryRouter initialEntries={['/learn']}>
    <Routes>
      <Route path="/learn" element={<LearnScreen />} />
    </Routes>
  </MemoryRouter>
)
const reader = (id: string) => (
  <MemoryRouter initialEntries={[`/learn/pack/${id}`]}>
    <Routes>
      <Route path="/learn/pack/:id" element={<PackReader />} />
      <Route path="/learn" element={<div>library</div>} />
    </Routes>
  </MemoryRouter>
)
const packId = async (title: string) => (await db.contentPacks.toArray()).find((p) => p.title === title)!.id

describe('Learn — works fully offline (no network code involved)', () => {
  it('shows ONE quote for the day, deterministic by date', async () => {
    const quotes = await db.dailyQuotes.toArray()
    const expected = quoteForDate(quotes, T0)!
    const { unmount } = render(learn())
    expect(await screen.findByTestId('quote')).toHaveTextContent(expected.text)
    unmount()
    render(learn()) // a reload shows the same quote
    expect(await screen.findByTestId('quote')).toHaveTextContent(expected.text)
    expect(screen.getAllByTestId('quote')).toHaveLength(1)
  })

  it('the next day shows a different quote', async () => {
    const quotes = await db.dailyQuotes.toArray()
    setClockSource(() => localDate(addDays(T0, 1), '10:00'))
    render(learn())
    expect(await screen.findByTestId('quote')).toHaveTextContent(quoteForDate(quotes, addDays(T0, 1))!.text)
    expect(quoteForDate(quotes, T0)!.id).not.toBe(quoteForDate(quotes, addDays(T0, 1))!.id)
  })

  it('saving a quote persists', async () => {
    const u = userEvent.setup()
    render(learn())
    await u.click(await screen.findByRole('button', { name: 'Save quote' }))
    await waitFor(async () => expect((await db.dailyQuotes.toArray()).filter((q) => q.saved)).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Unsave quote' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('today’s pack is chosen by matching THIS week’s topics (week 4: binary search · dbms · http)', async () => {
    render(learn())
    const todays = await screen.findByTestId('todays-pack')
    expect(todays.textContent).toMatch(/Binary search boundaries|ACID|B\+ trees|HTTP request/)
    expect(within(todays).getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('a week with no matching pack says so — no filler recommendation', async () => {
    setClockSource(() => localDate('2027-01-12', '10:00')) // week 15: revision · mocks
    render(learn())
    expect(await screen.findByText(/No pack matches this week/)).toBeInTheDocument()
    expect(screen.queryByTestId('todays-pack')).toBeNull()
  })

  it('the library is a two-column grid; by default it shows the 12 core packs, not the exam-prep collection', async () => {
    render(learn())
    const lib = await screen.findByTestId('library')
    expect(lib.className).toMatch(/grid-cols-2/)
    expect(within(lib).getAllByRole('link')).toHaveLength(12)
  })
})

describe('Learn — Capgemini exam prep', () => {
  const onDay = (n: number) => setClockSource(() => localDate(addDays('2026-10-07', n - 1), '10:00'))

  it('on prep day 4 the card lists that day’s lesson and drills, with the day count and the exam countdown', async () => {
    onDay(4)
    render(learn())
    const card = await screen.findByTestId('capg-card')
    expect(card).toHaveTextContent('Day 4 of 60')
    expect(card).toHaveTextContent('58 days to the exam (Mon 7 Dec)')
    expect(within(within(card).getByRole('list', { name: 'Learn for today' })).getByRole('link', { name: /Recursion & the call stack/ })).toBeInTheDocument()
    expect(within(within(card).getByRole('list', { name: 'Drills for today' })).getAllByRole('link').length).toBeGreaterThan(0)
  })

  it('says plainly that the seeded exam date is a placeholder, until the user edits it', async () => {
    onDay(4)
    const { unmount } = render(learn())
    expect(await screen.findByText(/placeholder — confirm it from your invitation/)).toBeInTheDocument()
    unmount()
    const exam = (await db.events.toArray()).find((e) => e.title.startsWith('Capgemini exam'))!
    await db.events.put({ ...exam, userModified: true, date: '2026-12-14' })
    render(learn())
    await waitFor(() => expect(screen.getByTestId('capg-card')).toHaveTextContent('65 days to the exam (Mon 14 Dec)'))
    expect(screen.queryByText(/placeholder — confirm it/)).toBeNull()
  })

  it('exam-prep packs are never chosen as the generic “today’s pack”', async () => {
    onDay(4)
    render(learn())
    const todays = await screen.findByTestId('todays-pack')
    expect(todays).not.toHaveTextContent(/Recursion & the call stack|Drill ·/)
  })

  it('the library filters by scope and by kind', async () => {
    const u = userEvent.setup()
    onDay(4)
    render(learn())
    const lib = await screen.findByTestId('library')
    const scope = screen.getByRole('group', { name: 'Library scope' })
    await u.click(within(scope).getByRole('button', { name: 'Capgemini' }))
    await waitFor(() => expect(within(lib).getAllByRole('link').length).toBeGreaterThan(100))
    await u.click(within(screen.getByRole('group', { name: 'Capgemini pack kind' })).getByRole('button', { name: 'Debugging' }))
    await waitFor(() => expect(within(lib).getAllByRole('link')).toHaveLength(22))
    expect(within(lib).getAllByRole('link')[0]).toHaveTextContent(/Debugging/)
    await u.click(within(scope).getByRole('button', { name: 'All' }))
    await waitFor(() => expect(within(lib).getAllByRole('link').length).toBeGreaterThan(200))
  })

  it('“Browse all Capgemini packs” switches the library to the collection', async () => {
    const u = userEvent.setup()
    onDay(4)
    render(learn())
    await u.click(await screen.findByRole('button', { name: 'Browse all Capgemini packs' }))
    expect(within(screen.getByRole('group', { name: 'Library scope' })).getByRole('button', { name: 'Capgemini', pressed: true })).toBeInTheDocument()
  })

  it('after the 60 days the card shows no scheduled work, only an upcoming exam countdown', async () => {
    onDay(62) // 7 Dec, exam day
    render(learn())
    const card = await screen.findByTestId('capg-card')
    expect(card).toHaveTextContent('window has ended')
    expect(card).toHaveTextContent('the exam is today')
    expect(within(card).queryAllByRole('link')).toHaveLength(0)
  })

  it('once the exam has passed the card disappears', async () => {
    onDay(70)
    render(learn())
    await screen.findByTestId('quote')
    expect(screen.queryByTestId('capg-card')).toBeNull()
  })
})

describe('Reader — one card per screen; a pack ENDS', () => {
  it('renders all 8 cards in the 8-beat order, with progress dots', async () => {
    render(reader(await packId('Closures')))
    const cards = await screen.findAllByTestId('reader-card')
    expect(cards).toHaveLength(8)
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Why does this print 3, 3, 3?', 'A function and the scope it was born in', 'A private counter', 'makeCounter', 'A backpack', 'The loop trap, and the leak', 'Predict it', 'Closures in four lines'])
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '8')
  })

  it('uses the serif reader style and shows code in a code block', async () => {
    render(reader(await packId('Closures')))
    const cards = await screen.findAllByTestId('reader-card')
    expect(cards[0]!.querySelector('.t-reader')).not.toBeNull()
    expect(cards[3]!.querySelector('pre code')!.textContent).toContain('function makeCounter()')
  })

  it('a CHECK card hides its answer until you ask for it', async () => {
    const u = userEvent.setup()
    render(reader(await packId('Closures')))
    const cards = await screen.findAllByTestId('reader-card')
    const check = cards[6]!
    expect(within(check).queryByTestId('check-answer')).toBeNull()
    await u.click(within(check).getByRole('button', { name: 'Reveal the answer' }))
    expect(within(check).getByTestId('check-answer')).toHaveTextContent('0, 1, 2')
  })

  it('paging forward records progress for the day; reaching the summary completes the pack and offers Finish — nothing further', async () => {
    const u = userEvent.setup()
    const id = await packId('Two pointers')
    render(reader(id))
    await screen.findAllByTestId('reader-card')
    await u.click(screen.getByRole('button', { name: 'Next card' }))
    await u.click(screen.getByRole('button', { name: 'Next card' }))
    await waitFor(async () => expect((await db.packProgress.toArray())[0]).toMatchObject({ packId: id, date: T0, cardsViewed: 3, cardsTotal: 8, completed: false }))
    for (let i = 0; i < 5; i++) await u.click(screen.getByRole('button', { name: 'Next card' }))
    expect(await screen.findByRole('button', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next card' })).toBeNull()
    await waitFor(async () => expect((await db.packProgress.toArray())[0]).toMatchObject({ cardsViewed: 8, completed: true }))
    expect(screen.getByText('That’s the pack. It ends here.')).toBeInTheDocument()
    expect(screen.queryByText(/recommended|up next|more like this/i)).toBeNull()
    expect(await db.packProgress.count()).toBe(1) // one row per pack per day
  })

  it('"Back" is disabled on the first card; unknown packs say so', async () => {
    const { unmount } = render(reader(await packId('Promises')))
    await screen.findAllByTestId('reader-card')
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeDisabled()
    unmount()
    render(reader('nope'))
    expect(await screen.findByText('Pack not found')).toBeInTheDocument()
  })
})
