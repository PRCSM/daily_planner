import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SettingsScreen } from './SettingsScreen'
import { ThemeProvider } from '@/ui/theme'
import { db } from '@/data/db'
import { ensureSeeded } from '@/data/seed'
import { buildExport } from '@/data/backup'
import { createNote, getNote, updateBlock } from '@/data/repos/notes'
import { addLogBlock } from '@/features/services/logging'
import { freshDbPerTest } from '@/test/db'
import { T0 } from '@/test/factories'
import { setSyncStatus } from '@/data/sync/status'

freshDbPerTest()
beforeEach(async () => {
  localStorage.clear()
  setSyncStatus({ state: 'DISABLED', pending: 0, lastSyncAt: null, lastError: null })
  await ensureSeeded()
})
const ui = () => (
  <ThemeProvider>
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>
  </ThemeProvider>
)

describe('Settings', () => {
  it('with no cloud configured it says so plainly — the app is fully local', async () => {
    render(ui())
    expect(await screen.findByTestId('sync-state')).toHaveTextContent('Local only')
    expect(screen.getByTestId('sync-card')).toHaveTextContent(/isn’t configured for this build/)
    expect(screen.queryByLabelText('Email for sign-in link')).toBeNull()
  })

  it('shows queued changes and the last error from the sync status', async () => {
    setSyncStatus({ state: 'OFFLINE', pending: 7, lastSyncAt: null, lastError: 'OFFLINE: network down' })
    render(ui())
    expect(await screen.findByTestId('sync-state')).toHaveTextContent('Offline — changes are queued')
    expect(screen.getByTestId('sync-card')).toHaveTextContent('7 changes waiting')
    expect(screen.getByTestId('sync-error')).toHaveTextContent('OFFLINE: network down')
  })

  it('switches theme and persists the choice', async () => {
    const u = userEvent.setup()
    render(ui())
    await u.click(await screen.findByRole('button', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('cadence.theme')).toBe('light')
    await u.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('AI check without cloud config gives the specific NO_KEY message (no network attempted)', async () => {
    const u = userEvent.setup()
    render(ui())
    await u.click(await screen.findByRole('button', { name: 'Check AI' }))
    expect(await screen.findByTestId('ai-check')).toHaveTextContent(/server has no Groq key/)
  })

  it('states that the Groq key lives only in the Edge Function', async () => {
    render(ui())
    expect(await screen.findByText(/never in this app, its storage, or your backups/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/groq|api key/i)).toBeNull() // there is deliberately no key field
  })

  it('diagnostics list live vs deleted row counts and versions', async () => {
    const u = userEvent.setup()
    await addLogBlock({ date: T0, track: 'DSA', minutes: 30, aiUsed: false })
    render(ui())
    await u.click(await screen.findByRole('button', { name: /Row counts, sync and storage/ }))
    const table = await screen.findByRole('table', { name: 'Row counts' })
    await waitFor(() => expect(within(table).getByText('logBlocks')).toBeInTheDocument())
    expect(screen.getByText(/\/ v1 \/ v3/)).toBeInTheDocument() // schema v1, seed v3
  })
})

describe('Export', () => {
  it('warns that the file holds your full history before saving anything', async () => {
    const u = userEvent.setup()
    const download = vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (download(b), 'blob:x'))
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    HTMLAnchorElement.prototype.click = vi.fn()
    render(ui())
    await u.click(await screen.findByRole('button', { name: 'Export backup' }))
    const sheet = await screen.findByTestId('export-warning')
    await waitFor(() => expect(sheet).toHaveAttribute('data-open', 'true')) // the sheet element is pre-mounted; wait until it is actually open
    expect(sheet).toHaveTextContent(/full history/)
    expect(download).not.toHaveBeenCalled() // nothing is saved until you confirm
    expect(within(sheet).queryByTestId('key-warning')).toBeNull()
    await u.click(within(sheet).getByRole('button', { name: 'Save the file' }))
    expect(download).toHaveBeenCalledOnce()
    const blob = download.mock.calls[0]![0] as Blob
    expect(JSON.parse(await blob.text())).toMatchObject({ app: 'cadence', formatVersion: 1 })
  })

  it('flags a key-shaped string that a user pasted into a note — redacted, and before saving', async () => {
    const u = userEvent.setup()
    const n = await createNote('scratch')
    await updateBlock((await getNote(n.id)).blocks[0]!.id, { text: 'gsk_' + 'Q'.repeat(40) })
    render(ui())
    await u.click(await screen.findByRole('button', { name: 'Export backup' }))
    const warning = await screen.findByTestId('key-warning')
    expect(warning).toHaveTextContent(/looks like a secret/)
    expect(warning.textContent).not.toContain('Q'.repeat(20)) // never echoes the secret
    expect(warning).toHaveTextContent('gsk_…QQ')
  })
})

describe('Import', () => {
  async function exportOf() {
    await addLogBlock({ date: T0, track: 'DSA', minutes: 45, topic: 'graphs', aiUsed: false })
    return new File([JSON.stringify(await buildExport())], 'b.json', { type: 'application/json' })
  }

  it('shows a PREVIEW with per-table counts and writes nothing until confirmed; then merges', async () => {
    const u = userEvent.setup()
    const file = await exportOf()
    const { eraseLocalData } = await import('@/data/backup')
    await eraseLocalData()
    await ensureSeeded()
    render(ui())
    await u.upload(await screen.findByLabelText('Choose a backup file'), file)
    const preview = await screen.findByTestId('import-preview')
    expect(preview).toHaveTextContent('logBlocks')
    expect(preview).toHaveTextContent('+1 new')
    expect(await db.logBlocks.count()).toBe(0)
    await u.click(within(preview).getByRole('button', { name: /^Import \d+ changes?$/ }))
    await waitFor(async () => expect(await db.logBlocks.count()).toBe(1))
    expect(await screen.findByRole('status')).toHaveTextContent(/Imported \d+ rows?/)
  })

  it('re-importing the same file offers nothing new', async () => {
    const u = userEvent.setup()
    const file = await exportOf()
    render(ui())
    await u.upload(await screen.findByLabelText('Choose a backup file'), file)
    expect(await screen.findByRole('button', { name: 'Nothing new to import' })).toBeDisabled()
  })

  it('rejects a bad file with a clear message and imports nothing', async () => {
    const u = userEvent.setup()
    render(ui())
    await u.upload(await screen.findByLabelText('Choose a backup file'), new File(['{"not":"cadence"}'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByTestId('import-fatal')).toHaveTextContent(/isn’t a Cadence backup/)
  })
})
