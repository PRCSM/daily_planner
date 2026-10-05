/**
 * A deliberately tiny, constrained markdown subset for lesson cards and AI chat.
 * It parses to a DATA structure which the UI renders as React text nodes — there is no HTML output, no links,
 * no images, and nothing here can ever reach dangerouslySetInnerHTML. Model output is untrusted.
 *
 *   blocks:  paragraphs · "- " bullets · "1. " numbered lists · ``` fenced code
 *   inline:  **bold** · *italic* · `code`
 */
export type Inline = { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'italic'; v: string } | { t: 'code'; v: string }
export type Block =
  | { t: 'p'; inline: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'code'; v: string; lang?: string }

export const MAX_MARKDOWN_CHARS = 20_000

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ t: 'code', v: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    } else if (c === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ t: 'bold', v: src.slice(i + 2, end) })
        i = end + 2
        continue
      }
    } else if (c === '*' && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = src.indexOf('*', i + 1)
      if (end > i + 1 && src[end - 1] !== ' ') {
        flush()
        out.push({ t: 'italic', v: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    buf += c
    i++
  }
  flush()
  return out
}

const BULLET = /^\s*(?:[-•]|\*(?=\s))\s+/
const NUMBERED = /^\s*\d{1,3}[.)]\s+/

export function parseMarkdown(raw: string): Block[] {
  const src = raw.length > MAX_MARKDOWN_CHARS ? raw.slice(0, MAX_MARKDOWN_CHARS) : raw
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', inline: parseInline(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items.map(parseInline) })
    list = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = /^\s*```\s*([A-Za-z0-9_+-]{0,20})\s*$/.exec(line)
    if (fence) {
      flushPara()
      flushList()
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) body.push(lines[i++]!)
      blocks.push({ t: 'code', v: body.join('\n'), lang: fence[1] || undefined })
      continue
    }
    if (line.trim() === '') {
      flushPara()
      flushList()
    } else if (BULLET.test(line)) {
      flushPara()
      if (list?.kind !== 'ul') {
        flushList()
        list = { kind: 'ul', items: [] }
      }
      list!.items.push(line.replace(BULLET, ''))
    } else if (NUMBERED.test(line)) {
      flushPara()
      if (list?.kind !== 'ol') {
        flushList()
        list = { kind: 'ol', items: [] }
      }
      list!.items.push(line.replace(NUMBERED, ''))
    } else if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}` // wrapped list item
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return blocks
}

/** CHECK cards are "Q: …\n\nA: …": the answer is hidden until the reader asks. */
export function splitCheck(body: string): { question: string; answer: string | null } {
  const m = /\n\s*\n?\s*A:\s*/.exec(body)
  if (!m) return { question: body.replace(/^\s*Q:\s*/, '').trim(), answer: null }
  return { question: body.slice(0, m.index).replace(/^\s*Q:\s*/, '').trim(), answer: body.slice(m.index + m[0].length).trim() }
}
