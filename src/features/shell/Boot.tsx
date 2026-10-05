import { useEffect, useState, type ReactNode } from 'react'
import { ensureSeeded } from '@/data/seed'
import { startSync } from '@/data/sync'

/** Seeds the database (idempotent, offline, no account) before first paint of data screens, then boots background sync. */
export function Boot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading')
  useEffect(() => {
    let stop = () => {}
    ensureSeeded()
      .then((r) => {
        if (r.invalidPacks.length) console.error('Seed packs failed validation:', r.invalidPacks)
        setState('ready')
        stop = startSync()
      })
      .catch((e: unknown) => setState({ error: e instanceof Error ? e.message : String(e) }))
    return () => stop()
  }, [])

  if (state === 'ready') return <>{children}</>
  if (state === 'loading') return <div className="grid h-full place-items-center"><span className="t-display text-ink-2">cadence</span></div>
  return (
    <div className="mx-auto max-w-[520px] p-5">
      <h1 className="t-title">Couldn’t open the local database</h1>
      <p className="t-body mt-2 text-ink-2">{state.error}</p>
      <p className="t-label mt-2 text-ink-2">Private/incognito windows and some blocked-storage settings disable IndexedDB. Open Cadence in a normal window.</p>
    </div>
  )
}
