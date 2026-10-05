import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppShell } from '@/features/shell/AppShell'
import { RouteError } from '@/features/shell/RouteError'

/** Every route is lazy: its chunk loads on first visit and is precached by the service worker. */
const lazyRoute = (load: () => Promise<{ default: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
})

/** Single source of truth for route → module. The import smoke test walks this list. */
export const ROUTE_MODULES: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/': () => import('./today'),
  '/more': () => import('./more'),
  '/learn': () => import('./learn'),
  '/learn/pack/:id': () => import('./learn-pack'),
  '/learn/chat': () => import('./learn-chat'),
  '/planner': () => import('./planner'),
  '/calendar': () => import('./calendar'),
  '/plan': () => import('./plan'),
  '/progress': () => import('./progress'),
  '/progress/dsa': () => import('./progress-dsa'),
  '/opportunities': () => import('./opportunities'),
  '/applications': () => import('./applications'),
  '/timetable': () => import('./timetable'),
  '/settings': () => import('./settings'),
  '/notes': () => import('./notes'),
  '/notes/:id': () => import('./note'),
  '/plan/week/:n': () => import('./plan-week'),
  '/kitchen-sink': () => import('./kitchen-sink'),
}

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: Object.entries(ROUTE_MODULES).map(([path, load]) => ({ path, ...lazyRoute(load) })),
  },
]

export const router = createBrowserRouter(routes)
