import type { SyncTable } from './enums'

/**
 * The cloud as the sync worker sees it. An interface so the worker can be tested against an in-memory
 * fake (offline, replay, conflict, two devices) without a network — and so the Supabase SDK stays
 * confined to lib/supabase.ts.
 */
export interface PushRow {
  table: SyncTable
  id: string
  /** The row's own updatedAt (ISO). The server applies a push only if this is newer than what it holds. */
  updatedAt: string
  deletedAt: string | null
  data: Record<string, unknown>
}

export interface RemoteRow {
  table: string
  id: string
  updatedAt: string
  deletedAt: string | null
  data: Record<string, unknown>
  /** Monotonic server sequence — the pull watermark. */
  seq: number
}

export interface PullResult {
  rows: RemoteRow[]
  /** Highest seq in `rows` (or the input watermark when empty). */
  maxSeq: number
}

export type RemoteErrorKind = 'OFFLINE' | 'AUTH' | 'SERVER' | 'REJECTED'
export class RemoteError extends Error {
  constructor(
    public readonly kind: RemoteErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'RemoteError'
  }
}

export interface Remote {
  push(rows: PushRow[]): Promise<void>
  pull(sinceSeq: number, limit: number): Promise<PullResult>
}
