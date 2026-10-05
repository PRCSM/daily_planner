/** A tiny observable for sync status — no React here; the UI subscribes with useSyncExternalStore. */
export type SyncState = 'DISABLED' | 'SIGNED_OUT' | 'IDLE' | 'SYNCING' | 'OFFLINE' | 'ERROR'

export interface SyncStatus {
  state: SyncState
  pending: number
  lastSyncAt: string | null
  lastError: string | null
}

let current: SyncStatus = { state: 'DISABLED', pending: 0, lastSyncAt: null, lastError: null }
const listeners = new Set<() => void>()

export const getSyncStatus = (): SyncStatus => current
export function setSyncStatus(patch: Partial<SyncStatus>): void {
  current = { ...current, ...patch }
  listeners.forEach((l) => l())
}
export function subscribeSyncStatus(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
