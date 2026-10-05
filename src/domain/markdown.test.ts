import { describe, expect, it } from 'vitest'
import { MAX_MARKDOWN_CHARS, parseInline, parseMarkdown, splitCheck } from './markdown'

const text = (v: string) => ({ t: 'text', v })

describe('parseInline', () => {
  it('bold, italic, code and plain text', () => {
    expect(parseInline('a **b** c *d* `e`')).toEqual([text('a '), { t: 'bold', v: 'b' }, text(' c '), { t: 'italic', v: 'd' }, text(' '), { t: 'code', v: 'e' }])
  })
  it('unclosed markers stay as literal text (never throw, never swallow)', () => {
    expect(parseInline('**oops')).toEqual([text('**oops')])
    expect(parseInline('a `b')).toEqual([text('a `b')])
    expect(parseInline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')])
  })
  it('does not interpret markers inside code', () => {
    expect(parseInline('`**x**`')).toEqual([{ t: 'code', v: '**x**' }])
  })
})

describe('parseMarkdown', () => {
  it('paragraphs split on blank lines; single newlines join', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([{ t: 'p', inline: [text('one two')] }, { t: 'p', inline: [text('three')] }])
  })
  it('bullet and numbered lists, including wrapped items', () => {
    const b = parseMarkdown('- a\n- b **x**\n  continued\n\n1. one\n2) two')
    expect(b[0]).toEqual({ t: 'ul', items: [[text('a')], [text('b '), { t: 'bold', v: 'x' }, text(' continued')]] })
    expect(b[1]).toEqual({ t: 'ol', items: [[text('one')], [text('two')]] })
  })
  it('fenced code is kept verbatim with its language; an unclosed fence runs to the end', () => {
    expect(parseMarkdown('x\n```py\nprint("<b>hi</b>")\n```\ny')).toEqual([{ t: 'p', inline: [text('x')] }, { t: 'code', v: 'print("<b>hi</b>")', lang: 'py' }, { t: 'p', inline: [text('y')] }])
    expect(parseMarkdown('```\nopen')).toEqual([{ t: 'code', v: 'open', lang: undefined }])
  })
  it('a list switching kind starts a new list', () => {
    expect(parseMarkdown('- a\n1. b').map((x) => x.t)).toEqual(['ul', 'ol'])
  })
  it('HTML, script tags, javascript: links and images are just TEXT — there is no HTML or link node type at all', () => {
    const hostile = '<script>alert(1)</script> <img src=x onerror=alert(1)> [click](javascript:alert(1)) ![x](http://evil)'
    const b = parseMarkdown(hostile)
    expect(b).toHaveLength(1)
    const kinds = new Set(JSON.stringify(b).match(/"t":"(\w+)"/g))
    expect([...kinds].every((k) => ['"t":"p"', '"t":"text"'].includes(k))).toBe(true)
    expect(JSON.stringify(b)).toContain('<script>alert(1)</script>') // present only as a string value
  })
  it('caps input size and stays fast on adversarial input', () => {
    const t0 = performance.now()
    const b = parseMarkdown('*a '.repeat(MAX_MARKDOWN_CHARS))
    expect(b.length).toBeGreaterThan(0)
    expect(JSON.stringify(b).length).toBeLessThan(MAX_MARKDOWN_CHARS * 4)
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(() => parseMarkdown('`'.repeat(50000))).not.toThrow()
  })
  it('empty input → no blocks', () => expect(parseMarkdown('')).toEqual([]))
})

describe('splitCheck', () => {
  it('separates the question from the hidden answer', () => {
    expect(splitCheck('Q: What prints?\n\nA: 0, 1, 2.')).toEqual({ question: 'What prints?', answer: '0, 1, 2.' })
  })
  it('no answer marker → the whole body is the question', () => {
    expect(splitCheck('Think about it.')).toEqual({ question: 'Think about it.', answer: null })
  })
  it('works with a single newline before A:', () => {
    expect(splitCheck('Q: x\nA: y')).toEqual({ question: 'x', answer: 'y' })
  })
})
