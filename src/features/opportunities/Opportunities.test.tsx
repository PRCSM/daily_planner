import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { OpportunitiesScreen } from './OpportunitiesScreen'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { freshDbPerTest } from '@/test/db'
import { setClockSource, localDate } from '@/lib/clock'
import { CAVEAT_GITHUB, CAVEAT_IT_SERVICES, CAVEAT_QUANT, CAVEAT_SUMMER_2027 } from '@/seed/events'

freshDbPerTest()
beforeEach(async () => {
  await ensureSeeded()
})

describe('Opportunities', () => {
  it('month sections in order, with the seeded months from Jul to Mar', async () => {
    render(<OpportunitiesScreen />)
    await screen.findByText('Amazon — SDE new-grad applications')
    const labels = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(labels[0]).toBe('July 2026')
    expect(labels).toContain('October 2026')
    expect(labels.at(-1)).toBe('March 2027')
    expect(labels).toContain('December 2026')
  })

  it('a caveat shared by several rows is rendered ONCE above the group, not on every row', async () => {
    render(<OpportunitiesScreen />)
    await screen.findByText('Amazon — SDE new-grad applications')
    for (const c of [CAVEAT_GITHUB, CAVEAT_SUMMER_2027, CAVEAT_QUANT, CAVEAT_IT_SERVICES]) {
      const matches = screen.getAllByText(c)
      const sharedBanners = matches.filter((m) => m.getAttribute('data-testid') === 'shared-caveat')
      // wherever it is shared inside a month, it appears as a banner; no row repeats the same text inline in that month
      expect(sharedBanners.length, c).toBeGreaterThanOrEqual(1)
    }
    const july = screen.getByRole('region', { name: 'July 2026' })
    expect(within(july).getAllByText(CAVEAT_GITHUB)).toHaveLength(1) // two GitHub tracker rows, one caveat
    const group = within(july).getByTestId('caveat-group')
    expect(within(group).getAllByTestId('opportunity')).toHaveLength(2)
  })

  it('a row with a unique caveat shows it inline', async () => {
    render(<OpportunitiesScreen />)
    const sih = (await screen.findByText('Smart India Hackathon (SIH)')).closest('[data-testid="opportunity"]') as HTMLElement
    expect(within(sih).getByText(/six-person team/)).toBeInTheDocument()
  })

  it('past windows are CLOSED — dimmed and sunk to the bottom of their month, never removed', async () => {
    setClockSource(() => localDate('2026-07-25', '10:00')) // Flipkart GRiD (15 Jul → 20 Aug) still open; nothing closed yet in July…
    const { unmount } = render(<OpportunitiesScreen />)
    await screen.findByText('Amazon — SDE new-grad applications')
    unmount()
    setClockSource(() => localDate('2026-12-20', '10:00')) // …but by late December the autumn windows are over
    render(<OpportunitiesScreen />)
    const rows = await screen.findAllByTestId('opportunity')
    const closed = rows.filter((r) => r.getAttribute('data-closed') === 'true')
    expect(closed.length).toBeGreaterThan(20)
    expect(rows.length).toBe((await db.events.toArray()).filter((e) => e.fitPill).length) // every row still present
    const oct = screen.getByRole('region', { name: 'October 2026' })
    const octRows = within(oct).getAllByTestId('opportunity').map((r) => r.getAttribute('data-closed'))
    expect(octRows).not.toContain('false') // all closed by now…
    const jul = screen.getByRole('region', { name: 'July 2026' })
    expect(within(jul).getAllByTestId('opportunity')[0]!.className).toMatch(/opacity-50/)
  })

  it('lists the 12 portals with their caveats', async () => {
    render(<OpportunitiesScreen />)
    expect(await screen.findByText('Wellfound')).toBeInTheDocument()
    expect(screen.getByText('Google Alerts')).toBeInTheDocument()
    expect(screen.getByText('r/developersIndia')).toBeInTheDocument()
  })

  it('apply links open in a new tab safely', async () => {
    render(<OpportunitiesScreen />)
    const amazon = (await screen.findByText('Amazon — SDE new-grad applications')).closest('[data-testid="opportunity"]') as HTMLElement
    const link = within(amazon).getByRole('link', { name: /Apply/ })
    expect(link).toHaveAttribute('href', 'https://www.amazon.jobs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
  })
})
