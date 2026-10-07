import { describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { ensureSeeded } from './seed'
import { freshDbPerTest } from '@/test/db'

vi.mock('@/seed/capgemini', async () => ({ ...(await vi.importActual<Record<string, unknown>>('@/seed/capgemini')), loadCapgemini: vi.fn().mockRejectedValue(new Error('chunk failed to load')) }))

freshDbPerTest()

describe('ensureSeeded when the lazily-loaded Capgemini chunk cannot be fetched', () => {
  it('writes nothing, records no version, and reports it as deferred so the next launch retries', async () => {
    const r = await ensureSeeded()
    expect(r).toMatchObject({ ran: false, deferred: true })
    expect(await db.contentPacks.count()).toBe(0)
    expect(await db.weeklyTargets.count()).toBe(0)
    expect(await db.syncMeta.get('seedVersion')).toBeUndefined()
  })
})
