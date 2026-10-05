import type { Remote } from '@/lib/remote'
import type { CadenceDB } from '../db'
import { setSyncStatus } from './status'
import { backoffMs, pendingCount, readSyncMeta, syncOnce } from './worker'

export interface ControllerDeps {
  db: () => CadenceDB
  getRemote: () => Remote | null
  hasSession: () => Promise<boolean>
  isOnline: () => boolean
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
  /** Steady-state poll for remote changes. */
  intervalMs?: number
  /** Collapse bursts of local writes into one sync. */
  debounceMs?: number
}

/** Decides WHEN to sync; syncOnce decides WHAT. Everything time-related is injected. */
export function createSyncController(deps: ControllerDeps) {
  const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = deps.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const intervalMs = deps.intervalMs ?? 60_000
  const debounceMs = deps.debounceMs ?? 2_000
  let timer: unknown = null
  let running = false
  let failures = 0
  let stopped = true

  const arm = (ms: number) => {
    if (timer !== null) cancel(timer)
    if (stopped) return
    timer = schedule(() => void run(), ms)
  }

  async function refreshPending() {
    const db = deps.db()
    const meta = await readSyncMeta(db)
    setSyncStatus({ pending: await pendingCount(db), lastSyncAt: meta.lastSyncAt, lastError: meta.lastError })
  }

  async function run(): Promise<void> {
    if (running || stopped) return
    running = true
    try {
      const remote = deps.getRemote()
      if (!remote) return void setSyncStatus({ state: 'DISABLED' })
      await refreshPending()
      if (!(await deps.hasSession())) return void setSyncStatus({ state: 'SIGNED_OUT' })
      if (!deps.isOnline()) return void setSyncStatus({ state: 'OFFLINE' }) // pending writes simply wait
      setSyncStatus({ state: 'SYNCING' })
      const res = await syncOnce(deps.db(), remote)
      if (res.ok) {
        failures = 0
        await refreshPending()
        setSyncStatus({ state: 'IDLE' })
      } else {
        failures++
        await refreshPending()
        setSyncStatus({ state: res.error?.kind === 'OFFLINE' ? 'OFFLINE' : 'ERROR' })
      }
    } finally {
      running = false
      arm(failures > 0 ? backoffMs(failures) : intervalMs)
    }
  }

  return {
    start() {
      stopped = false
      void run()
    },
    stop() {
      stopped = true
      if (timer !== null) cancel(timer)
      timer = null
    },
    /** A local write happened, we came online, or the tab became visible. */
    trigger() {
      if (stopped) return
      failures = 0
      arm(debounceMs)
    },
    /** Sync now (Settings → "Sync now"). */
    runNow: () => run(),
    get failures() {
      return failures
    },
  }
}
