/**
 * The ONLY module that imports the Supabase SDK. Everything the app needs from it — a session, magic-link
 * sign-in, and the sync Remote — is exposed through plain functions so no other file sees the SDK.
 *
 * The anon key is public by design (RLS is the protection). The Groq key is NOT here, and never will be:
 * it lives in the Edge Function's secrets.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { RemoteError, type PullResult, type PushRow, type Remote } from './remote'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isCloudConfigured = (): boolean => Boolean(url && anonKey)

let client: SupabaseClient | null = null
export function getClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null
  client ??= createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

export const functionsUrl = (name: string): string | null => (url ? `${url.replace(/\/$/, '')}/functions/v1/${name}` : null)
export const anonApiKey = (): string | null => anonKey ?? null

export async function getSession(): Promise<Session | null> {
  const c = getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session
}
export async function getAccessToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null
}

export function onAuthChange(cb: (email: string | null) => void): () => void {
  const c = getClient()
  if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((_event, session) => cb(session?.user.email ?? null))
  return () => data.subscription.unsubscribe()
}

export async function signInWithEmail(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const c = getClient()
  if (!c) return { ok: false, message: 'Cloud sync is not configured for this build.' }
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  return error ? { ok: false, message: error.message } : { ok: true }
}

export async function signOut(): Promise<void> {
  await getClient()?.auth.signOut()
}

function classify(error: { message: string; code?: string; status?: number } | null, fallback: string): RemoteError {
  const status = error?.status
  const msg = error?.message ?? fallback
  if (status === 401 || status === 403 || error?.code === '28000' || /jwt|not authenticated/i.test(msg)) return new RemoteError('AUTH', msg)
  if (/network|failed to|load failed|typeerror/i.test(msg)) return new RemoteError('OFFLINE', msg)
  if (status && status >= 400 && status < 500) return new RemoteError('REJECTED', msg)
  return new RemoteError('SERVER', msg)
}

export function createSupabaseRemote(): Remote | null {
  const c = getClient()
  if (!c) return null
  return {
    async push(rows: PushRow[]): Promise<void> {
      const { error } = await c.rpc('sync_push', { p_rows: rows })
      if (error) throw classify(error, 'push failed')
    },
    async pull(sinceSeq: number, limit: number): Promise<PullResult> {
      const { data, error } = await c
        .from('sync_rows')
        .select('table_name,row_id,data,client_updated_at,deleted_at,seq')
        .gt('seq', sinceSeq)
        .order('seq', { ascending: true })
        .limit(limit)
      if (error) throw classify(error, 'pull failed')
      const rows = (data ?? []).map((r) => ({
        table: r.table_name as string,
        id: r.row_id as string,
        updatedAt: r.client_updated_at as string,
        deletedAt: (r.deleted_at as string | null) ?? null,
        data: r.data as Record<string, unknown>,
        seq: Number(r.seq),
      }))
      return { rows, maxSeq: rows.reduce((m, r) => Math.max(m, r.seq), sinceSeq) }
    },
  }
}

/** "Delete all my cloud data." Local data is untouched. */
export async function wipeCloud(): Promise<{ ok: boolean; message?: string }> {
  const c = getClient()
  if (!c) return { ok: false, message: 'Not configured' }
  const { error } = await c.rpc('sync_wipe')
  return error ? { ok: false, message: error.message } : { ok: true }
}
