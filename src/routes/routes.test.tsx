import { describe, expect, it } from 'vitest'
import { ROUTE_MODULES, routes } from './index'

/**
 * Import smoke test: every route module must EVALUATE and expose a default export.
 * Module-scope throws in chart / native-ish libraries are invisible to every other test, because
 * component tests import screens by their feature path and never load the route chunk.
 */
describe('route modules', () => {
  const entries = Object.entries(ROUTE_MODULES)
  it('there are routes to check', () => expect(entries.length).toBeGreaterThanOrEqual(10))

  for (const [path, load] of entries) {
    it(`${path} evaluates and exposes a default component`, async () => {
      const mod = await load()
      expect(typeof mod.default).toBe('function')
    })
  }

  it('every route path in the router comes from ROUTE_MODULES (no unlisted routes)', () => {
    const paths = routes[0]!.children!.map((c) => c.path)
    expect(paths.sort()).toEqual(Object.keys(ROUTE_MODULES).sort())
  })
})
