import { createBrowserRouter, type RouteObject } from 'react-router'

/** Every route is lazy: its chunk loads on first visit and is precached by the service worker. */
const lazyRoute = (load: () => Promise<{ default: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
})

export const routes: RouteObject[] = [
  { path: '/', ...lazyRoute(() => import('./kitchen-sink')) },
  { path: '/kitchen-sink', ...lazyRoute(() => import('./kitchen-sink')) },
]

export const router = createBrowserRouter(routes)
