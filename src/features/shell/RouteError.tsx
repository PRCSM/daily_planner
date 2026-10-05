import { useRouteError } from 'react-router'
import { Button, Screen } from '@/ui/primitives'

/** Shown when a route chunk fails to load (e.g. first visit while offline) or a screen throws. */
export function RouteError() {
  const err = useRouteError()
  const message = err instanceof Error ? err.message : 'Something went wrong.'
  return (
    <Screen>
      <h1 className="t-title">That screen didn’t load</h1>
      <p className="t-body mt-2 text-ink-2">{message}</p>
      <p className="t-label mt-2 text-ink-2">If you’re offline and haven’t opened this screen before, reconnect once so it can be cached.</p>
      <Button className="mt-4" onClick={() => window.location.assign('/')}>
        Back to today
      </Button>
    </Screen>
  )
}
