import { createSupabaseRemote, getSession, isCloudConfigured, onAuthChange } from '@/lib/supabase'
import { db } from '../db'
import { createSyncController } from './controller'
import { setSyncStatus } from './status'

export { getSyncStatus, subscribeSyncStatus, type SyncStatus, type SyncState } from './status'

let controller: ReturnType<typeof createSyncController> | null = null

/**
 * Boot the background sync. Safe to call once at startup: with no Supabase config (or no account) it just
 * reports DISABLED / SIGNED_OUT and the app stays fully local.
 */
export function startSync(): () => void {
  if (controller) return () => {}
  if (!isCloudConfigured()) {
    setSyncStatus({ state: 'DISABLED' })
    return () => {}
  }
  const remote = createSupabaseRemote()
  controller = createSyncController({
    db: () => db,
    getRemote: () => remote,
    hasSession: async () => (await getSession()) !== null,
    isOnline: () => navigator.onLine,
  })
  const trigger = () => controller?.trigger()
  const onVisible = () => document.visibilityState === 'visible' && trigger()
  window.addEventListener('online', trigger)
  document.addEventListener('visibilitychange', onVisible)
  // Any queued write (Dexie fires this inside the writing transaction) schedules a debounced sync.
  const sub = () => trigger()
  db.syncQueue.hook('creating', sub)
  db.syncQueue.hook('updating', sub)
  const unAuth = onAuthChange(() => trigger())
  controller.start()
  return () => {
    window.removeEventListener('online', trigger)
    document.removeEventListener('visibilitychange', onVisible)
    db.syncQueue.hook('creating').unsubscribe(sub)
    db.syncQueue.hook('updating').unsubscribe(sub)
    unAuth()
    controller?.stop()
    controller = null
  }
}

export const syncNow = (): Promise<void> => controller?.runNow() ?? Promise.resolve()
