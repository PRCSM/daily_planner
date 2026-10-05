import { CARD_TYPES, type CardType } from './enums'

/**
 * Pack validation — the SAME validator for seeded packs and AI-generated ones.
 * Treats input as untrusted: strips fences, parses in try/catch, checks every
 * field. Rejects rather than writes garbage.
 */

export const PACK_LIMITS = { maxCards: 12, minCards: 3, maxCardChars: 2000, maxHeading: 120, maxTitle: 120 } as const

export interface ValidCard {
  orderIndex: number
  type: CardType
  heading?: string
  body: string
  codeSnippet?: string
  codeLang?: string
}
export interface ValidPack {
  title: string
  summary: string
  cards: ValidCard[]
}
export type PackValidation = { ok: true; pack: ValidPack } | { ok: false; errors: string[] }

export function stripFences(raw: string): string {
  let s = raw.trim()
  const fence = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(s)
  if (fence && fence[1] !== undefined) s = fence[1].trim()
  else s = s.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/```\s*$/, '').trim()
  // Models sometimes prepend prose: take from the first { to the last }.
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first > 0 && last > first) s = s.slice(first, last + 1)
  return s
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCardType = (v: unknown): v is CardType => typeof v === 'string' && (CARD_TYPES as readonly string[]).includes(v)

export function validatePackJson(raw: string): PackValidation {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(raw))
  } catch {
    return { ok: false, errors: ['Not valid JSON'] }
  }
  return validatePackObject(parsed)
}

export function validatePackObject(parsed: unknown): PackValidation {
  const errors: string[] = []
  if (!isObj(parsed)) return { ok: false, errors: ['Root must be an object'] }
  const { title, summary, cards } = parsed
  if (typeof title !== 'string' || !title.trim()) errors.push('title missing')
  else if (title.length > PACK_LIMITS.maxTitle) errors.push('title too long')
  if (typeof summary !== 'string' || !summary.trim()) errors.push('summary missing')
  if (!Array.isArray(cards)) {
    errors.push('cards must be an array')
    return { ok: false, errors }
  }
  if (cards.length < PACK_LIMITS.minCards) errors.push(`needs at least ${PACK_LIMITS.minCards} cards`)
  if (cards.length > PACK_LIMITS.maxCards) errors.push(`more than ${PACK_LIMITS.maxCards} cards`)

  const out: ValidCard[] = []
  cards.forEach((c: unknown, i: number) => {
    if (!isObj(c)) return errors.push(`card ${i}: not an object`)
    if (!isCardType(c.type)) return errors.push(`card ${i}: unknown type`)
    if (typeof c.body !== 'string' || !c.body.trim()) return errors.push(`card ${i}: body missing`)
    if (c.orderIndex !== undefined && c.orderIndex !== i) errors.push(`card ${i}: orderIndex not contiguous (got ${String(c.orderIndex)})`)
    const heading = typeof c.heading === 'string' ? c.heading : undefined
    const code = typeof c.codeSnippet === 'string' ? c.codeSnippet : undefined
    if (heading && heading.length > PACK_LIMITS.maxHeading) errors.push(`card ${i}: heading too long`)
    const chars = c.body.length + (heading?.length ?? 0) + (code?.length ?? 0)
    if (chars > PACK_LIMITS.maxCardChars) errors.push(`card ${i}: over ${PACK_LIMITS.maxCardChars} chars`)
    if (c.type === 'CODE' && !code) errors.push(`card ${i}: CODE card needs codeSnippet`)
    out.push({
      orderIndex: i,
      type: c.type,
      heading,
      body: c.body,
      codeSnippet: code,
      codeLang: typeof c.codeLang === 'string' ? c.codeLang.slice(0, 20) : undefined,
    })
  })
  // A pack is a story: it opens with a hook and closes with a summary.
  if (out.length && out[0]!.type !== 'HOOK') errors.push('first card must be HOOK')
  if (out.length && out[out.length - 1]!.type !== 'SUMMARY') errors.push('last card must be SUMMARY')

  if (errors.length) return { ok: false, errors }
  return { ok: true, pack: { title: (title as string).trim(), summary: (summary as string).trim(), cards: out } }
}
