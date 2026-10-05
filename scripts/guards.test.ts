import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
// @ts-expect-error — plain .mjs script, no types
import { runGuards, scanSource, stripComments } from './guards.mjs'

type V = { rule: string; file: string; line: number; hit: string }
const dirs: string[] = []
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'guards-'))
  dirs.push(root)
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, text)
  }
  return root
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const rules = (v: V[]) => v.map((x) => x.rule)

describe('stripComments', () => {
  it('removes line and block comments', () => {
    expect(stripComments('a // fetch(\nb /* fetch( */ c')).not.toContain('fetch')
  })
  it('does not treat // inside a string as a comment', () => {
    const out = stripComments("const u = 'https://x.y'; fetch(u)")
    expect(out).toContain('fetch(u)')
  })
  it('keeps template literal contents', () => {
    expect(stripComments('const s = `a // b`; z()')).toContain('z()')
  })
})

describe('guards catch PLANTED violations (a guard you have not seen fail is not a guard)', () => {
  it('flags fetch outside lib/ai', () => {
    const v = scanSource('src/features/x.ts', 'export const x = () => fetch("/a")')
    expect(rules(v)).toContain('NETWORK')
  })
  it('flags an ALIASED fetch', () => {
    const v = scanSource('src/features/x.ts', 'const f = globalThis.fetch; const g = window["fetch"]; import { fetch as ff } from "x"')
    expect(v.filter((x: V) => x.rule === 'NETWORK').length).toBeGreaterThan(0)
  })
  it('allows fetch inside lib/ai', () => {
    expect(scanSource('src/lib/ai/client.ts', 'await fetch(url)')).toEqual([])
  })
  it('ignores fetch in a comment', () => {
    expect(scanSource('src/features/x.ts', '// fetch(url)\n/* XMLHttpRequest */')).toEqual([])
  })
  it('flags XHR / WebSocket / sendBeacon / EventSource', () => {
    for (const t of ['new XMLHttpRequest()', 'new WebSocket(u)', 'navigator.sendBeacon(u)', 'new EventSource(u)']) {
      expect(rules(scanSource('src/features/x.ts', t))).toContain('NETWORK')
    }
  })
  it('flags the Supabase SDK outside lib/supabase.ts, allows it inside', () => {
    expect(rules(scanSource('src/data/sync/x.ts', "import { createClient } from '@supabase/supabase-js'"))).toContain('NETWORK')
    expect(scanSource('src/lib/supabase.ts', "import { createClient } from '@supabase/supabase-js'")).toEqual([])
  })
  it('flags clock reads outside lib/clock.ts', () => {
    for (const t of ['new Date()', 'Date.now()', 'dayjs()', 'new Date().toISOString().slice(0, 10)', 'x.toISOString().split("T")[0]']) {
      expect(rules(scanSource('src/domain/x.ts', t)), t).toContain('CLOCK')
    }
    expect(scanSource('src/lib/clock.ts', 'new Date()')).toEqual([])
  })
  it('does not flag a Date built from an argument', () => {
    expect(scanSource('src/domain/x.ts', 'new Date(2026, 0, 1); dayjs("2026-01-01")')).toEqual([])
  })
  it('flags key-shaped secrets everywhere, comments and tests included', () => {
    const key = 'gsk_' + 'a'.repeat(32)
    expect(rules(scanSource('src/lib/x.ts', `// ${key}`))).toContain('SECRETS')
    expect(rules(scanSource('src/lib/x.test.ts', `const k = "${key}"`))).toContain('SECRETS')
    expect(rules(scanSource('src/lib/x.ts', 'const k = import.meta.env.VITE_GROQ_KEY'))).toContain('SECRETS')
  })
  it('runGuards walks a project tree and fails on a planted file', () => {
    const root = project({
      'src/lib/ok.ts': 'export const a = 1',
      'src/features/bad.ts': 'export const go = () => fetch("/x")',
      'README.md': 'harmless',
    })
    const v = runGuards(root)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ rule: 'NETWORK', file: 'src/features/bad.ts', line: 1 })
  })
  it('runGuards passes a clean tree', () => {
    expect(runGuards(project({ 'src/domain/a.ts': 'export const a = 1' }))).toEqual([])
  })
})
