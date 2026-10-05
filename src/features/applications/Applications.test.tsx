import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApplicationsScreen } from './ApplicationsScreen'
import { ApplicationSheet } from './ApplicationSheet'
import { StatusPicker } from './StatusPicker'
import { useUi } from '@/features/store'
import { db } from '@/data/db'
import { createApplication } from '@/features/services/applications'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { APPLICATION_STATUSES } from '@/lib/enums'
import { nextStates } from '@/domain/applicationsFsm'

freshDbPerTest()
beforeEach(() => useUi.setState({ sheet: { name: null } }))

const screenUi = () => (
  <>
    <ApplicationsScreen />
    <ApplicationSheet />
  </>
)

describe('StatusPicker — illegal transitions are UNREACHABLE', () => {
  it('offers exactly nextStates(current), for every status', async () => {
    for (const s of APPLICATION_STATUSES) {
      const { unmount } = render(<StatusPicker current={s} onAdvance={() => {}} />)
      const offered = screen.queryAllByTestId(/^advance-/).map((b) => b.getAttribute('data-testid')!.replace('advance-', ''))
      expect(offered, s).toEqual([...nextStates(s)])
      unmount()
    }
  })
  it('REJECTED shows no controls at all; SAVED cannot offer OFFER or INTERVIEW', () => {
    const { unmount } = render(<StatusPicker current="REJECTED" onAdvance={() => {}} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    unmount()
    render(<StatusPicker current="SAVED" onAdvance={() => {}} />)
    expect(screen.queryByTestId('advance-OFFER')).toBeNull()
    expect(screen.queryByTestId('advance-INTERVIEW')).toBeNull()
  })
  it('the callback receives only a legal target', async () => {
    const u = userEvent.setup()
    const got: string[] = []
    render(<StatusPicker current="APPLIED" onAdvance={(t) => got.push(t)} />)
    await u.click(screen.getByTestId('advance-OA'))
    expect(got).toEqual(['OA'])
  })
})

describe('Applications screen', () => {
  it('shows the census with ZEROS for every status (including rejected) and says it is not a funnel', async () => {
    render(screenUi())
    const census = await screen.findByTestId('census')
    for (const s of APPLICATION_STATUSES) expect(within(census).getByTestId(`census-${s}`)).toHaveTextContent('0')
    expect(census).toHaveTextContent(/not a conversion funnel/i)
  })

  it('groups in funnel order (offer … rejected) and counts update as status moves', async () => {
    const u = userEvent.setup()
    await createApplication({ company: 'Acme', role: 'SDE', type: 'FULL_TIME', startStatus: 'APPLIED' }, T0)
    await createApplication({ company: 'Beta', role: 'SDE', type: 'FULL_TIME', startStatus: 'SAVED' }, T0)
    render(screenUi())
    await screen.findByText('Acme')
    const sections = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(sections).toEqual(['Applied', 'Saved']) // funnel order, not insertion order
    expect(screen.getByTestId('census-APPLIED')).toHaveTextContent('1')
    const acme = screen.getByText('Acme').closest('[data-testid="application-card"]') as HTMLElement
    await u.click(within(acme).getByTestId('advance-INTERVIEW'))
    await waitFor(() => expect(screen.getByTestId('census-INTERVIEW')).toHaveTextContent('1'))
    expect(screen.getByTestId('census-APPLIED')).toHaveTextContent('0')
    expect((await db.applications.toArray()).find((a) => a.company === 'Acme')!.status).toBe('INTERVIEW')
  })

  it('a follow-up that is due is flagged (warning), a future one is quiet', async () => {
    const a = await createApplication({ company: 'Gamma', role: 'SDE', type: 'FULL_TIME', startStatus: 'APPLIED' }, T0)
    await db.applications.update(a.id, { nextFollowUp: T0 }) // due today
    render(screenUi())
    expect(await screen.findByText(/follow up today/)).toBeInTheDocument()
  })

  it('the sheet saves a new application, validating the link', async () => {
    const u = userEvent.setup()
    render(screenUi())
    useUi.getState().openSheet('application')
    const sheet = await screen.findByTestId('application-sheet')
    await u.type(within(sheet).getByLabelText('Company'), 'Delta')
    await u.type(within(sheet).getByLabelText('Role'), 'Backend')
    await u.type(within(sheet).getByLabelText('Link'), 'javascript:alert(1)')
    await u.click(within(sheet).getByRole('button', { name: 'Add application' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/web address/)
    expect(await db.applications.count()).toBe(0)
    await u.clear(within(sheet).getByLabelText('Link'))
    await u.type(within(sheet).getByLabelText('Link'), 'https://delta.test/jobs')
    await u.click(within(sheet).getByRole('button', { name: 'Yes — I applied' }))
    await u.click(within(sheet).getByRole('button', { name: 'Add application' }))
    await waitFor(async () => expect(await db.applications.count()).toBe(1))
    expect((await db.applications.toArray())[0]).toMatchObject({ company: 'Delta', status: 'APPLIED', url: 'https://delta.test/jobs' })
    expect(await db.events.count()).toBe(1) // the follow-up landed on the one timeline
  })
})
