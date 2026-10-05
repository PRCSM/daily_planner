import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

/**
 * Plants a violation in a virtual file and asserts ESLint reports it.
 * Proves the layer / purity / network / clock rules actually fire.
 */
const eslint = new ESLint({ cwd: process.cwd() })
async function lint(filePath: string, code: string) {
  const [res] = await eslint.lintText(code, { filePath })
  return (res?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`)
}
const has = (msgs: string[], rule: string) => msgs.some((m) => m.startsWith(rule))

describe('ESLint architecture rules fail on planted violations', () => {
  it('lib/ must not import from data/ (layer order)', async () => {
    const m = await lint('src/lib/x.ts', "import { x } from '@/data/types'\nexport const a = x")
    expect(has(m, 'import-x/no-restricted-paths')).toBe(true)
  })
  it('data/ must not import from domain/', async () => {
    const m = await lint('src/data/x.ts', "import { z } from '@/domain/dates'\nexport const a = z")
    expect(has(m, 'import-x/no-restricted-paths')).toBe(true)
  })
  it('domain/ must not import from ui/ or features/', async () => {
    const m = await lint('src/domain/x.ts', "import { KitchenSink as f } from '@/features/kitchen-sink/KitchenSink'\nexport const a = f")
    expect(has(m, 'import-x/no-restricted-paths')).toBe(true)
  })
  it('domain/ may import data/types only — not data/db', async () => {
    const ok = await lint('src/domain/x.ts', "import type { x } from '@/data/types'\nexport type A = typeof x")
    expect(has(ok, 'import-x/no-restricted-paths')).toBe(false)
    const bad = await lint('src/domain/x.ts', "import { y } from '@/data/db'\nexport const a = y")
    expect(has(bad, 'import-x/no-restricted-paths')).toBe(true)
  })
  it('domain/ must not import react, dexie, or the clock', async () => {
    for (const src of ["import 'react'", "import 'dexie'", "import { readClock } from '@/lib/clock'\nexport const a = readClock"]) {
      const m = await lint('src/domain/x.ts', src)
      expect(has(m, 'no-restricted-imports'), src).toBe(true)
    }
  })
  it('components must not touch the db directly', async () => {
    const m = await lint('src/features/x.tsx', "import { y } from '@/data/db'\nexport const a = y")
    expect(has(m, 'no-restricted-imports')).toBe(true)
    const d = await lint('src/ui/x.tsx', "import Dexie from 'dexie'\nexport const a = Dexie")
    expect(has(d, 'no-restricted-imports')).toBe(true)
  })
  it('fetch / XHR is banned outside lib/ai, allowed inside', async () => {
    const bad = await lint('src/features/x.ts', 'export const go = () => fetch("/a")')
    expect(has(bad, 'no-restricted-globals')).toBe(true)
    const win = await lint('src/features/x.ts', 'export const go = () => window.fetch("/a")')
    expect(has(win, 'no-restricted-properties')).toBe(true)
    const ok = await lint('src/lib/ai/x.ts', 'export const go = () => fetch("/a")')
    expect(has(ok, 'no-restricted-globals')).toBe(false)
  })
  it('the Supabase SDK is importable only from lib/supabase.ts', async () => {
    const bad = await lint('src/data/sync/x.ts', "import { createClient } from '@supabase/supabase-js'\nexport const a = createClient")
    expect(has(bad, 'no-restricted-imports')).toBe(true)
    const ok = await lint('src/lib/supabase.ts', "import { createClient } from '@supabase/supabase-js'\nexport const a = createClient")
    expect(has(ok, 'no-restricted-imports')).toBe(false)
  })
  it('clock reads are banned outside lib/clock.ts', async () => {
    for (const src of ['export const a = new Date()', 'export const a = Date.now()', 'export const a = new Date().toISOString().slice(0, 10)']) {
      const m = await lint('src/domain/x.ts', src)
      expect(has(m, 'no-restricted-syntax'), src).toBe(true)
    }
    const ok = await lint('src/lib/clock.ts', 'export const a = new Date()')
    expect(has(ok, 'no-restricted-syntax')).toBe(false)
  })
})
