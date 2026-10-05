import { useEffect, useState } from 'react'
import { getSession, isCloudConfigured, onAuthChange } from '@/lib/supabase'

/** The signed-in email (or null). Cloud is optional: with no Supabase config this is always null. */
export function useSession(): { configured: boolean; email: string | null; ready: boolean } {
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(!isCloudConfigured())
  useEffect(() => {
    let alive = true
    void getSession().then((s) => {
      if (!alive) return
      setEmail(s?.user.email ?? null)
      setReady(true)
    })
    const un = onAuthChange((e) => alive && setEmail(e))
    return () => {
      alive = false
      un()
    }
  }, [])
  return { configured: isCloudConfigured(), email, ready }
}
