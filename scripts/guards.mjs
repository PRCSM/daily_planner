#!/usr/bin/env node
/**
 * Source guards — the grep half of "lint AND grep" (lint cannot see aliased imports).
 *
 *  1. NETWORK    fetch / XHR / WebSocket / EventSource / sendBeacon / http clients live in src/lib/ai only;
 *                the Supabase SDK is imported only by src/lib/supabase.ts.
 *  2. CLOCK      only src/lib/clock.ts reads the clock (no `new Date()`, `Date.now`, `dayjs()`,
 *                `toISOString().slice`), because a UTC-derived "local date" is wrong 5.5h/day in IST.
 *  3. SECRETS    no Groq-key-shaped strings or VITE_GROQ* env anywhere in the repo sources.
 *
 * Comments are stripped before scanning. A guard you have not seen fail is not a guard:
 * scripts/guards.test.ts plants violations and asserts each one is caught.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Remove // and block comments, leaving string / template contents intact. */
export function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
    } else if (c === '/' && d === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i++
      }
      i += 2
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c
      out += c
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') {
          out += src[i]
          i++
        }
        if (q !== '`' && src[i] === '\n') break
        out += src[i]
        i++
      }
      if (i < n) {
        out += src[i]
        i++
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

const posix = (p) => p.split(sep).join('/')

const NETWORK_TOKENS = [
  [/\bfetch\b/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\b(?:axios|node-fetch|undici|ky|got)\b['"]/, 'http client import'],
  [/from\s+['"]axios['"]|require\(\s*['"]axios['"]/, 'axios'],
]
const SDK = /@supabase\//
const CLOCK_TOKENS = [
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date()'],
  [/\bDate\s*\.\s*now\b/, 'Date.now'],
  [/\bdayjs\s*\(\s*\)/, 'dayjs()'],
  [/\bdayjs\s*\.\s*utc\s*\(\s*\)/, 'dayjs.utc()'],
  [/toISOString\s*\(\s*\)\s*\.\s*(?:slice|substring|substr|split)\b/, 'toISOString().slice/split (UTC date)'],
]
const SECRET_TOKENS = [
  [/gsk_[A-Za-z0-9]{16,}/, 'Groq-key-shaped string'],
  [/\bVITE_GROQ/, 'VITE_GROQ* env (keys never ship to the client)'],
  [/\bsk-[A-Za-z0-9]{24,}/, 'sk- key-shaped string'],
]

/** @returns {{rule:string, file:string, line:number, hit:string}[]} */
export function scanSource(relPath, text) {
  const file = posix(relPath)
  const isTest = /\.test\.[tj]sx?$/.test(file) || file.startsWith('src/test/')
  const code = stripComments(text)
  const lines = code.split('\n')
  const found = []
  const check = (rule, tokens) => {
    lines.forEach((line, idx) => {
      for (const [re, hit] of tokens) if (re.test(line)) found.push({ rule, file, line: idx + 1, hit })
    })
  }
  if (!isTest) {
    // src/seed/ is lesson TEXT (it legitimately talks about fetch() and WebSocket); it executes nothing.
    // The SDK-import check below still applies to it.
    if (!file.startsWith('src/lib/ai/') && !file.startsWith('src/seed/')) check('NETWORK', NETWORK_TOKENS)
    if (file !== 'src/lib/supabase.ts') check('NETWORK', [[SDK, 'Supabase SDK import outside src/lib/supabase.ts']])
    if (file !== 'src/lib/clock.ts') check('CLOCK', CLOCK_TOKENS)
  }
  // Secrets are scanned in tests too (fixtures must not contain real-looking keys),
  // and in the raw text so a commented-out key is still caught.
  text.split('\n').forEach((line, idx) => {
    for (const [re, hit] of SECRET_TOKENS) if (re.test(line)) found.push({ rule: 'SECRETS', file, line: idx + 1, hit })
  })
  return found
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === 'coverage' || name.startsWith('dev-dist')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?|mjs|cjs|html|json|sql|md)$/.test(name)) out.push(p)
  }
  return out
}

/** Scan `<root>/src` (network + clock + secrets) and the rest of the repo (secrets only). */
export function runGuards(root) {
  const violations = []
  for (const abs of walk(root)) {
    const rel = posix(relative(root, abs))
    const text = readFileSync(abs, 'utf8')
    if (/^src\/.*\.(tsx?|jsx?)$/.test(rel)) {
      violations.push(...scanSource(rel, text))
    } else if (!rel.startsWith('scripts/') && !/\.test\.[tj]sx?$/.test(rel) && rel !== 'package-lock.json') {
      // Non-src files: secrets only.
      text.split('\n').forEach((line, idx) => {
        for (const [re, hit] of SECRET_TOKENS) if (re.test(line)) violations.push({ rule: 'SECRETS', file: rel, line: idx + 1, hit })
      })
    }
  }
  return violations
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invoked) {
  const root = process.cwd()
  const v = runGuards(root)
  if (v.length) {
    console.error('Guard violations:')
    for (const x of v) console.error(`  [${x.rule}] ${x.file}:${x.line}  ${x.hit}`)
    process.exit(1)
  }
  console.log('guards: ok (network, clock, secrets)')
}
