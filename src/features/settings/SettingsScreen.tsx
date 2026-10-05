import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { SCHEMA_VERSION, buildExport, commitImport, eraseLocalData, exportFilename, findKeyShapedStrings, previewImport, tableCounts, type ImportPreview } from '@/data/backup'
import { getSyncStatus, subscribeSyncStatus, syncNow } from '@/data/sync'
import { SEED_VERSION } from '@/data/seed'
import { checkAi, AI_MESSAGES, type AiFailure, type AiHealth } from '@/lib/ai'
import { signInWithEmail, signOut, wipeCloud } from '@/lib/supabase'
import { readClock } from '@/lib/clock'
import { Button, Card, CardList, Chip, Note, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { ChipGroup, TextField } from '@/ui/controls'
import { Sheet } from '@/ui/Sheet'
import { useTheme, type ThemeChoice } from '@/ui/theme'
import { Collapsible } from '@/features/common/bits'
import { useOnline } from '@/features/useOnline'
import { useSession } from './useSession'

const STATE_LABEL = { DISABLED: 'Local only', SIGNED_OUT: 'Signed out', IDLE: 'Up to date', SYNCING: 'Syncing…', OFFLINE: 'Offline — changes are queued', ERROR: 'Needs attention' } as const

export function SettingsScreen() {
  return (
    <Screen>
      <ScreenTitle sub={`Cadence ${__APP_VERSION__}`}>settings</ScreenTitle>
      <SyncSection />
      <AiSection />
      <ThemeSection />
      <DataSection />
      <Diagnostics />
      <DangerZone />
    </Screen>
  )
}

function SyncSection() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
  const session = useSession()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <>
      <SectionLabel>Sync</SectionLabel>
      <Card data-testid="sync-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="t-body-strong" data-testid="sync-state">{STATE_LABEL[status.state]}</div>
            <div className="t-label text-ink-2">
              {status.pending} change{status.pending === 1 ? '' : 's'} waiting · {status.lastSyncAt ? `last synced ${new Date(status.lastSyncAt).toLocaleString()}` : 'never synced'}
            </div>
          </div>
          {session.configured && session.email ? <Button variant="secondary" className="!min-h-9" onClick={() => void syncNow()}>Sync now</Button> : null}
        </div>
        {status.lastError ? <p className="t-label mt-2 text-warning" data-testid="sync-error">Last error: {status.lastError}</p> : null}

        {!session.configured ? (
          <Note className="mt-3">
            Cloud sync isn’t configured for this build, so everything lives on this device. To enable it, create a Supabase project, run <code>supabase/migrations/0001_init.sql</code>, and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>. The app works fully without it.
          </Note>
        ) : session.email ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="t-label text-ink-2">Signed in as {session.email}</span>
            <Button variant="ghost" className="!min-h-9" onClick={() => void signOut()}>Sign out</Button>
          </div>
        ) : (
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const r = await signInWithEmail(email.trim())
              setMsg(r.ok ? 'Check your email for the sign-in link.' : r.message)
            }}
          >
            <TextField type="email" aria-label="Email for sign-in link" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" variant="secondary">Email me a sign-in link</Button>
            {msg ? <p role="status" className="t-label text-ink-2">{msg}</p> : null}
          </form>
        )}
      </Card>
    </>
  )
}

function AiSection() {
  const online = useOnline()
  const [state, setState] = useState<{ busy: boolean; health?: AiHealth; fail?: AiFailure }>({ busy: false })
  return (
    <>
      <SectionLabel>AI (Learn tab only)</SectionLabel>
      <Card>
        <p className="t-label text-ink-2">
          The Groq key lives only as a server-side secret in a Supabase Edge Function — never in this app, its storage, or your backups:
        </p>
        <pre className="t-meta mt-2 overflow-x-auto rounded-[10px] bg-bg p-3 font-mono text-ink-2">supabase secrets set GROQ_API_KEY=…{'\n'}supabase functions deploy ai</pre>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" disabled={!online || state.busy} onClick={async () => {
            setState({ busy: true })
            const r = await checkAi()
            setState(r.ok ? { busy: false, health: r.data } : { busy: false, fail: r.reason })
          }}>
            {state.busy ? 'Checking…' : 'Check AI'}
          </Button>
          {!online ? <span className="t-label text-ink-2">Offline</span> : null}
        </div>
        {state.fail ? <p role="status" className="t-label mt-3 text-warning" data-testid="ai-check">{AI_MESSAGES[state.fail]}</p> : null}
        {state.health ? (
          <div role="status" className="t-label mt-3" data-testid="ai-check">
            Ready. Models in use: {state.health.available.join(', ') || 'none'}.
            {state.health.missing.length ? <span className="text-warning"> Retired or unavailable: {state.health.missing.join(', ')} — update GROQ_MODELS.</span> : null}
          </div>
        ) : null}
      </Card>
    </>
  )
}

function ThemeSection() {
  const { choice, setChoice } = useTheme()
  return (
    <>
      <SectionLabel>Appearance</SectionLabel>
      <ChipGroup label="Theme" options={['dark', 'light', 'system'] as const} value={choice} onChange={(c: ThemeChoice) => setChoice(c)} render={(c) => c[0]!.toUpperCase() + c.slice(1)} />
    </>
  )
}

function DataSection() {
  const [confirm, setConfirm] = useState<{ text: string; warnings: { kind: string; hint: string }[] } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function prepareExport() {
    const json = JSON.stringify(await buildExport(), null, 2)
    setConfirm({ text: json, warnings: findKeyShapedStrings(json) })
  }
  function download(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = exportFilename(readClock().date)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setConfirm(null)
  }

  return (
    <>
      <SectionLabel>Your data</SectionLabel>
      <CardList>
        <Card>
          <div className="t-body-strong">Export</div>
          <p className="t-label mt-1 text-ink-2">Everything you’ve logged, planned and written, as one JSON file.</p>
          <Button className="mt-3" variant="secondary" icon="download" onClick={() => void prepareExport()}>Export backup</Button>
        </Card>
        <Card>
          <div className="t-body-strong">Import</div>
          <p className="t-label mt-1 text-ink-2">Merges a backup into what’s here. Newer rows win; nothing is deleted. You’ll see a preview first.</p>
          <input
            aria-label="Choose a backup file"
            type="file"
            accept="application/json,.json"
            className="t-label mt-3 block w-full"
            onChange={async (e) => {
              setDone(null)
              const f = e.target.files?.[0]
              if (f) setPreview(await previewImport(await f.text()))
            }}
          />
          {preview ? <ImportPreviewView preview={preview} onCancel={() => setPreview(null)} onCommit={async () => {
            const r = await commitImport(preview)
            setDone(`Imported ${r.written} row${r.written === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} that conflicted` : ''}.`)
            setPreview(null)
            void syncNow()
          }} /> : null}
          {done ? <p role="status" className="t-label mt-3">{done}</p> : null}
        </Card>
      </CardList>

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} title="Before you save this file" testId="export-warning">
        <div className="flex flex-col gap-3">
          <p className="t-body">This backup contains your <b>full history</b>: daily logs, sleep, applications and company names, notes and chats. Anyone who gets the file can read it. Keep it somewhere private.</p>
          {confirm?.warnings.length ? (
            <div role="alert" className="rounded-[12px] border border-warning/60 p-3" data-testid="key-warning">
              <p className="t-label text-warning">This file contains text that looks like a secret ({confirm.warnings.map((w) => w.kind).join(', ')}) — probably pasted into a note.</p>
              <ul className="t-meta mt-1 text-ink-2">{confirm.warnings.map((w, i) => <li key={i}>{w.kind}: {w.hint}</li>)}</ul>
              <p className="t-label mt-1 text-ink-2">Find it with Notes → search, remove it, and rotate that key if it was real.</p>
            </div>
          ) : null}
          <Button onClick={() => confirm && download(confirm.text)}>Save the file</Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
        </div>
      </Sheet>
    </>
  )
}

function ImportPreviewView({ preview, onCommit, onCancel }: { preview: ImportPreview; onCommit: () => void; onCancel: () => void }) {
  if (!preview.ok) return <p role="alert" className="t-label mt-3 text-danger" data-testid="import-fatal">{preview.fatal}</p>
  const rows = Object.entries(preview.counts).filter(([, c]) => c && c.incoming > 0)
  const changes = rows.reduce((n, [, c]) => n + (c?.added ?? 0) + (c?.updated ?? 0), 0)
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="import-preview">
      <ul className="t-label flex flex-col gap-1">
        {rows.map(([t, c]) => (
          <li key={t} className="flex items-center justify-between rounded-[10px] bg-raised px-3 py-1.5">
            <span>{t}</span>
            <span className="text-ink-2">+{c!.added} new · {c!.updated} updated · {c!.unchanged} same{c!.invalid ? ` · ${c!.invalid} invalid` : ''}</span>
          </li>
        ))}
      </ul>
      {preview.issues.length ? (
        <details className="t-meta text-warning">
          <summary>{preview.issues.length} problem{preview.issues.length === 1 ? '' : 's'} (these rows are skipped)</summary>
          <ul className="mt-1 list-disc pl-5">{preview.issues.slice(0, 10).map((i, k) => <li key={k}>{i.table}{i.index >= 0 ? ` #${i.index}` : ''}: {i.message}</li>)}</ul>
        </details>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={changes === 0} onClick={onCommit}>{changes === 0 ? 'Nothing new to import' : `Import ${changes} change${changes === 1 ? '' : 's'}`}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function Diagnostics() {
  const counts = useLiveQuery(tableCounts, [], [])
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
  const online = useOnline()
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({})
  const [sw, setSw] = useState('checking…')
  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined)
      const persisted = await navigator.storage?.persisted?.().catch(() => undefined)
      setStorage({ usage: est?.usage, quota: est?.quota, persisted })
      setSw('serviceWorker' in navigator ? ((await navigator.serviceWorker.getRegistration())?.active ? 'active (works offline)' : 'not active yet') : 'unsupported')
    })()
  }, [])
  const mb = (n?: number) => (n === undefined ? '—' : `${(n / 1_048_576).toFixed(1)} MB`)
  const total = counts.reduce((n, c) => n + c.live, 0)
  return (
    <>
      <SectionLabel>Diagnostics</SectionLabel>
      <Collapsible title="Row counts, sync and storage" right={<Pill>{total} rows</Pill>}>
        <dl className="t-label grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-ink-2">App / schema / seed</dt><dd>{__APP_VERSION__} / v{SCHEMA_VERSION} / v{SEED_VERSION}</dd>
          <dt className="text-ink-2">Network</dt><dd>{online ? 'online' : 'offline'}</dd>
          <dt className="text-ink-2">Service worker</dt><dd>{sw}</dd>
          <dt className="text-ink-2">Sync</dt><dd>{STATE_LABEL[status.state]}</dd>
          <dt className="text-ink-2">Pending changes</dt><dd>{status.pending}</dd>
          <dt className="text-ink-2">Last sync</dt><dd>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'never'}</dd>
          <dt className="text-ink-2">Last error</dt><dd className="max-w-[60%] truncate text-right">{status.lastError ?? 'none'}</dd>
          <dt className="text-ink-2">Storage used</dt><dd>{mb(storage.usage)} of {mb(storage.quota)}</dd>
          <dt className="text-ink-2">Persistent storage</dt><dd>{storage.persisted === undefined ? '—' : storage.persisted ? 'yes' : 'no'}</dd>
        </dl>
        {storage.persisted === false ? <Chip className="mt-3" onClick={async () => setStorage({ ...storage, persisted: await navigator.storage.persist() })}>Ask the browser to keep my data</Chip> : null}
        <table className="t-meta mt-4 w-full" aria-label="Row counts">
          <thead><tr className="text-left text-ink-2"><th className="py-1">Table</th><th className="text-right">Live</th><th className="text-right">Deleted</th></tr></thead>
          <tbody>
            {counts.filter((c) => c.total > 0).map((c) => (
              <tr key={c.table} className="border-t border-hairline"><td className="py-1">{c.table}</td><td className="text-right tabular-nums">{c.live}</td><td className="text-right tabular-nums text-ink-2">{c.total - c.live}</td></tr>
            ))}
          </tbody>
        </table>
      </Collapsible>
    </>
  )
}

function DangerZone() {
  const session = useSession()
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <>
      <SectionLabel>Danger zone</SectionLabel>
      <Card tone="danger">
        <p className="t-label text-ink-2">Export a backup first. These can’t be undone.</p>
        {session.email ? (
          <Button variant="danger" className="mt-3" onClick={async () => {
            if (!window.confirm('Delete ALL your data from the cloud? Your data on this device stays.')) return
            const r = await wipeCloud()
            setMsg(r.ok ? 'Cloud data deleted.' : (r.message ?? 'Failed'))
          }}>Delete my cloud data</Button>
        ) : null}
        <div className="mt-3 flex gap-2">
          <TextField aria-label="Type ERASE to confirm" placeholder="type ERASE" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <Button variant="danger" disabled={typed !== 'ERASE'} onClick={async () => {
            await eraseLocalData()
            window.location.assign('/')
          }}>Erase local data</Button>
        </div>
        {msg ? <p role="status" className="t-label mt-2">{msg}</p> : null}
      </Card>
    </>
  )
}
