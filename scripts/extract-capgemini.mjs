#!/usr/bin/env node
/**
 * Extracts the Capgemini 2027 prep content from the standalone prep page (a single HTML file whose data lives in
 * script arrays) into src/seed/capgemini/content.json — the ONLY file the app reads.
 *
 *   node scripts/extract-capgemini.mjs <path-to-capgemini-2027-prep.html>
 *
 * The page's data region is evaluated in an empty vm context (no globals, no network, 5 s timeout) and the
 * lesson HTML is parsed with parse5 and rewritten into the app's constrained markdown (no HTML, no links, no
 * tables). Output is deterministic (no timestamps), so re-running on the same input produces no diff.
 *
 * What is converted: 61 lessons, 423 MCQs (as reveal-the-answer drills), 22 coding problems, 22 debugging
 * challenges, 83 interview questions, 8 prompt tasks, 4 AI-assisted-coding simulations, English drill material,
 * and the 60-day plan (as per-day schedules that reference the packs).
 * What is NOT converted: interactive mechanics (timers, scoring, speech recognition, the cognitive games).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { parseFragment } from 'parse5'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/extract-capgemini.mjs <capgemini-2027-prep.html>')
  process.exit(2)
}
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/seed/capgemini/content.json')

/* ───────────── 1. Load the data arrays ───────────── */
const lines = readFileSync(src, 'utf8').split('\n')
const a = lines.findIndex((l) => l.startsWith('const L = [];'))
const b = lines.findIndex((l) => l.startsWith('const SKEY'))
if (a < 0 || b < 0) throw new Error('data region not found — has the source page changed shape?')
const D = vm.runInNewContext(`${lines.slice(a, b).join('\n')}\n;({L,QB,DBG,PT,SIMS,DICT,READ,TOPICS,EMAILS,CP,IQ,PLAN,SECT,PCHECK})`, Object.create(null), { timeout: 5000 })

/* ───────────── 2. HTML → constrained markdown ───────────── */
const MAX_CARD = 1700 // chars of body per card (the validator allows 2000 incl. heading + snippet)

/** Pull [[code]] blocks out first: they hold raw text such as `<language>` that must never reach the HTML parser. */
function extractCode(html) {
  const codes = []
  const text = html.replace(/\[\[code\]\]([\s\S]*?)\[\[\/code\]\]/g, (_, c) => {
    codes.push(c.replace(/^\n/, '').replace(/\s+$/, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    return `<codeblock data-i="${codes.length - 1}"></codeblock>`
  })
  return { text, codes }
}

const attr = (n, name) => n.attrs?.find((x) => x.name === name)?.value
const isEl = (n) => typeof n.tagName === 'string'
const textOf = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(textOf).join(''))

function langGuess(code) {
  if (/^\s*(ROLE:|GOAL:|Here is |You are |Task:|Feature:)/m.test(code)) return 'text' // a prompt template, not source code
  if (/\bSELECT\b|\bFROM\b.*\bWHERE\b|\bJOIN\b/i.test(code) && !/[{};]/.test(code.replace(/'[^']*'/g, ''))) return 'sql'
  if (/#include|cout|vector<|std::|unordered_map|->/.test(code)) return 'cpp'
  if (/public static|System\.out|ArrayList|HashMap<|\bclass\s+\w+\s*\{/.test(code)) return 'java'
  if (/\bdef \w+\(|\bprint\(|^\s*import \w+$/m.test(code)) return 'python'
  if (/=>|\bconst\b|\blet\b|function\s*\(|console\.log|useState/.test(code)) return 'javascript'
  if (/\bint\b|\bvoid\b|printf|\bchar\b/.test(code)) return 'c'
  return 'text'
}

function inline(nodes, ctx = {}) {
  let out = ''
  for (const n of nodes) {
    if (n.nodeName === '#text') out += n.value.replace(/\s+/g, ' ').replace(/\*/g, '∗').replace(/`/g, "'")
    else if (isEl(n)) {
      const t = n.tagName
      const inner = () => inline(n.childNodes, ctx)
      if (t === 'b' || t === 'strong') {
        const s = ctx.bold ? inner() : inline(n.childNodes, { ...ctx, bold: true })
        out += ctx.bold || !s.trim() ? s : `**${s.trim()}**`
      } else if (t === 'i' || t === 'em') {
        const s = inline(n.childNodes, { ...ctx, ital: true }).trim()
        out += ctx.ital || !s ? s : `*${s}*`
      } else if (t === 'code') out += `\`${textOf(n).replace(/`/g, "'").replace(/\s+/g, ' ').trim()}\``
      else if (t === 'br') out += ctx.cell ? '; ' : '\n'
      else if (t === 'codeblock') out += `\n\n@@CODE${attr(n, 'data-i')}@@\n\n`
      else out += inner() // s, u, span, a, sub, sup, unknown → text only
    }
  }
  return out
}
const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim()

function listMd(node) {
  const ordered = node.tagName === 'ol'
  const items = (node.childNodes ?? []).filter((c) => c.tagName === 'li')
  return items.map((li, i) => `${ordered ? `${i + 1}.` : '-'} ${tidy(inline(li.childNodes, { cell: true }))}`).join('\n')
}

/** A table has no equivalent in the app's markdown, so each row becomes a bullet: **first cell** — Header: value; … */
function tableMd(node) {
  const rows = []
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      if (c.tagName === 'tr') rows.push(c.childNodes.filter((x) => x.tagName === 'td' || x.tagName === 'th'))
      else walk(c)
    }
  }
  walk(node)
  if (!rows.length) return ''
  const isHead = rows[0].every((c) => c.tagName === 'th')
  const head = isHead ? rows[0].map((c) => tidy(textOf(c))) : null
  const body = isHead ? rows.slice(1) : rows
  return body
    .map((cells) => {
      const vals = cells.map((c) => tidy(inline(c.childNodes, { cell: true, bold: true })))
      if (vals.length === 1) return `- ${vals[0]}`
      const first = vals[0].replace(/\*\*/g, '')
      const rest = vals.slice(1).map((v, i) => {
        const label = head?.[i + 1]
        return label && vals.length > 2 ? `${label}: ${v}` : v
      })
      return `- **${first}** — ${rest.filter(Boolean).join(' · ')}`
    })
    .join('\n')
}

/** Block structure of a lesson: [{k:'h3'|'md'|'code'|'box', ...}] */
function blocksOf(nodes, codes, out = []) {
  let run = []
  const flush = () => {
    if (!run.length) return
    const md = tidy(inline(run))
    run = []
    if (md) pushMdWithCode(md, codes, out)
  }
  for (const n of nodes) {
    if (n.nodeName === '#comment') continue
    if (n.nodeName === '#text') {
      run.push(n)
      continue
    }
    if (!isEl(n)) continue
    const t = n.tagName
    if (t === 'h3') {
      flush()
      out.push({ k: 'h3', text: tidy(inline(n.childNodes)) })
    } else if (t === 'p') {
      flush()
      pushMdWithCode(tidy(inline(n.childNodes)).replace(/\n/g, '\n\n'), codes, out)
    } else if (t === 'ul' || t === 'ol') {
      flush()
      out.push({ k: 'md', text: listMd(n) })
    } else if (t === 'table') {
      flush()
      const md = tableMd(n)
      if (md) out.push({ k: 'md', text: md })
    } else if (t === 'codeblock') {
      flush()
      out.push({ k: 'code', code: codes[Number(attr(n, 'data-i'))] })
    } else if (t === 'div' && /\bbox\b/.test(attr(n, 'class') ?? '')) {
      flush()
      const cls = (attr(n, 'class') ?? '').replace('box', '').trim() || 'plain'
      const kids = n.childNodes.filter((c) => !(c.nodeName === '#text' && !c.value.trim()))
      let title = ''
      let rest = kids
      if (kids[0]?.tagName === 'b') {
        title = tidy(textOf(kids[0]))
        rest = kids.slice(1)
      }
      const inner = []
      blocksOf(rest, codes, inner)
      out.push({ k: 'box', cls, title, items: inner })
    } else if (t === 'div') {
      flush()
      blocksOf(n.childNodes, codes, out)
    } else if (t === 'br') {
      flush()
    } else run.push(n) // b / i / code / span at block level → part of a text run
  }
  flush()
  return out
}

/** Text that contains code placeholders is split into md + code blocks. */
function pushMdWithCode(md, codes, out) {
  for (const part of md.split(/(@@CODE\d+@@)/)) {
    const m = /^@@CODE(\d+)@@$/.exec(part)
    if (m) out.push({ k: 'code', code: codes[Number(m[1])] })
    else if (part.trim()) out.push({ k: 'md', text: part.trim() })
  }
}

const fence = (code, lang) => '```' + (lang ?? '') + '\n' + code + '\n```'
const itemMd = (it) => (it.k === 'code' ? fence(it.code) : it.text)

/** Greedy split of block texts into chunks ≤ MAX_CARD; splits long list blocks on their line boundaries. */
function chunk(texts) {
  const units = []
  for (const t of texts) {
    if (t.length <= MAX_CARD) units.push(t)
    else if (t.startsWith('```')) units.push(t)
    else {
      let cur = ''
      for (const line of t.split('\n')) {
        if (cur && (cur + '\n' + line).length > MAX_CARD) {
          units.push(cur)
          cur = line
        } else cur = cur ? cur + '\n' + line : line
      }
      if (cur) units.push(cur)
    }
  }
  const out = []
  let cur = ''
  for (const u of units) {
    const joined = cur ? cur + '\n\n' + u : u
    if (cur && joined.length > MAX_CARD) {
      out.push(cur)
      cur = u
    } else cur = joined
  }
  if (cur) out.push(cur)
  return out
}

/* ───────────── 3. Pack builders ───────────── */
const SEC_NAME = { eng: 'English', tech: 'Technical', ai: 'AI literacy', dbg: 'Debugging', aic: 'AI-assisted coding', cog: 'Cognitive', int: 'Interview' }
const DSA_LESSONS = new Set(['t5', 't6', 't7', 't8', 't9', 't10', 't11', 't12'])
const trackOf = (sec, id) => (DSA_LESSONS.has(id) ? 'DSA' : { eng: 'WRITING', ai: 'GENAI', tech: 'CORE_CS', dbg: 'CORE_CS', aic: 'GENAI', cog: 'CORE_CS', int: 'WRITING' }[sec] ?? 'CORE_CS')
const letter = (i) => String.fromCharCode(65 + i)
const packs = []
const card = (type, heading, body, extra = {}) => ({ type, ...(heading ? { heading } : {}), body, ...extra })

function problems(list, where) {
  for (const p of list) {
    for (const c of p.cards) {
      const chars = c.body.length + (c.heading?.length ?? 0) + (c.codeSnippet?.length ?? 0)
      if (chars > 2000) throw new Error(`${p.key}: card over 2000 chars (${chars}) — ${where}`)
      if (c.heading && c.heading.length > 120) throw new Error(`${p.key}: heading too long`)
      if (c.type === 'CHECK') {
        const q = c.body.split(/\n\s*\n?\s*A:\s*/)[0]
        if (/^\s*A:/m.test(q)) throw new Error(`${p.key}: a CHECK question contains a line starting "A:"`)
        if (!/\n\s*\n?\s*A:\s*/.test(c.body)) throw new Error(`${p.key}: CHECK without an answer`)
      }
    }
    if (p.cards.length < 3 || p.cards.length > 12) throw new Error(`${p.key}: ${p.cards.length} cards (need 3–12)`)
    if (p.cards[0].type !== 'HOOK' || p.cards.at(-1).type !== 'SUMMARY') throw new Error(`${p.key}: must open with HOOK and close with SUMMARY`)
  }
}

/* ── Lessons ── */
const BOX = {
  trap: ['WARNING', 'Exam trap'],
  near: ['WARNING', 'Near miss'],
  tip: ['CONCEPT', 'Tip'],
  ex: ['EXAMPLE', 'Example'],
  plain: ['CONCEPT', 'Note'],
}
const drillKeyFor = new Map() // topic → [pack keys] (filled before lessons so a lesson can point to its drill)
const MAXQ = 10
function balanced(n) {
  const parts = Math.ceil(n / MAXQ)
  const size = Math.ceil(n / parts)
  return Array.from({ length: parts }, (_, i) => [i * size, Math.min(n, (i + 1) * size)])
}
for (const l of D.L) {
  const qs = D.QB.filter((q) => q.t === l.id)
  if (qs.length) drillKeyFor.set(l.id, balanced(qs.length).map((_, i, all) => `cg-drill-${l.id}${all.length > 1 ? `-${i + 1}` : ''}`))
}

function lessonPack(l) {
  const { text, codes } = extractCode(l.html)
  const blocks = blocksOf(parseFragment(text).childNodes, codes)
  const h3s = blocks.filter((x) => x.k === 'h3').map((x) => x.text)
  const cards = []
  const firstH3 = blocks.findIndex((x) => x.k === 'h3')
  const head = firstH3 < 0 ? blocks : blocks.slice(0, firstH3)
  const hasSections = firstH3 >= 0
  // HOOK: the opening paragraph when the lesson goes on to have sections; otherwise a generated line (the whole
  // body then becomes real content cards, so nothing is hidden behind the hook).
  const firstMd = head.findIndex((x) => x.k === 'md' && !/^[-\d]/.test(x.text))
  let hookBody
  let headRest = head
  if (hasSections && firstMd === 0) {
    const t = head[0].text
    if (t.length <= 700) {
      hookBody = t
      headRest = head.slice(1)
    } else {
      hookBody = t.slice(0, t.lastIndexOf(' ', 690)) + '…'
    }
  } else hookBody = `${l.mins} minutes on **${l.title}**. ${h3s.length ? 'You will cover: ' + h3s.join('; ') + '.' : 'Read it once for the idea, then once more to say it aloud.'}`
  cards.push(card('HOOK', SEC_NAME[l.sec] + ' · ' + l.mins + ' min', hookBody))
  const pushBody = (heading, items, type = 'CONCEPT') => {
    if (!items.length) return
    if (items.length === 1 && items[0].k === 'code' && items[0].code.length < 1800) {
      cards.push(card('CODE', heading, 'Study it line by line, then cover it and reproduce it from memory.', { codeSnippet: items[0].code, codeLang: langGuess(items[0].code) }))
      return
    }
    const parts = chunk(items.map(itemMd))
    parts.forEach((p, i) => cards.push(card(type, parts.length > 1 ? `${heading ?? 'Notes'} (${i + 1}/${parts.length})` : heading, p)))
  }
  const pushBox = (bx, fallbackHeading) => {
    const [type, label] = BOX[bx.cls] ?? BOX.plain
    const heading = bx.title ? bx.title : fallbackHeading ? `${fallbackHeading} · ${label.toLowerCase()}` : label
    const items = bx.items
    if (!items.length && !bx.title) return
    pushBody(heading.slice(0, 110), items.length ? items : [{ k: 'md', text: bx.title }], type)
  }
  {
    const body = headRest.filter((x) => x.k !== 'box')
    pushBody(body.every((x) => x.k === 'code') ? 'Example' : hasSections ? 'Overview' : 'The essentials', body)
  }
  for (const x of headRest) if (x.k === 'box') pushBox(x)
  // sections
  const rest = firstH3 < 0 ? [] : blocks.slice(firstH3)
  let sec = null
  const sections = []
  for (const x of rest) {
    if (x.k === 'h3') {
      sec = { heading: x.text, items: [] }
      sections.push(sec)
    } else sec.items.push(x)
  }
  for (const s of sections) {
    const main = s.items.filter((x) => x.k !== 'box')
    pushBody(s.heading.slice(0, 110), main)
    for (const bx of s.items.filter((x) => x.k === 'box')) pushBox(bx, s.heading.slice(0, 60))
  }
  const drills = drillKeyFor.get(l.id)
  const recap = h3s.length ? h3s.map((h) => `- ${h}`).join('\n') : null
  cards.push(
    card(
      'SUMMARY',
      'To remember',
      `${recap ? `This lesson covered:\n${recap}\n\n` : ''}Close the app and say the key points aloud in your own words, then check what you missed.${drills ? `\n\nNext: the drill pack “Drill · ${l.title}”.` : ''}`.slice(0, 1500),
    ),
  )
  return {
    key: `cg-lesson-${l.id}`,
    kind: 'lesson',
    title: l.title.slice(0, 118),
    summary: `${SEC_NAME[l.sec]} lesson (${l.mins} min of study time)${h3s.length ? ' · ' + h3s.slice(0, 3).join(' · ') : ''}`.slice(0, 220),
    track: trackOf(l.sec, l.id),
    cards,
  }
}
for (const l of D.L) packs.push(lessonPack(l))

/* ── Drills (MCQs as reveal-the-answer cards) ── */
function mcqBody(q, withCode = true) {
  const opts = q.o.map((o, i) => `- ${letter(i)}) ${o}`).join('\n')
  const right = (Array.isArray(q.a) ? q.a : [q.a]).map((i) => `${letter(i)}) ${q.o[i]}`).join(' and ')
  return `Q: ${q.q}${withCode && q.c ? `\n\n${fence(q.c)}` : ''}\n\n${opts}\n\nA: **${right}**\n\n${q.e}`
}
for (const l of D.L) {
  const qs = D.QB.filter((q) => q.t === l.id)
  if (!qs.length) continue
  const keys = drillKeyFor.get(l.id)
  balanced(qs.length).forEach(([from, to], i) => {
    const slice = qs.slice(from, to)
    const part = keys.length > 1 ? ` (part ${i + 1}/${keys.length})` : ''
    packs.push({
      key: keys[i],
      kind: 'drill',
      title: `Drill · ${l.title}`.slice(0, 100) + part,
      summary: `${slice.length} multiple-choice questions on this topic. Decide first, then reveal.`,
      track: trackOf(l.sec, l.id),
      cards: [
        card('HOOK', 'How to use this drill', `${slice.length} questions from the exam-style bank on **${l.title}**. For each one: commit to an answer first, then reveal. Count the ones you got right *before* looking.`),
        ...slice.map((q, k) => card('CHECK', `Question ${from + k + 1}`, mcqBody(q))),
        card('SUMMARY', 'After the drill', `Tally your score. For every miss, name the reason — **concept gap**, **careless slip** or **time** — and fix that, not just the answer. Concept gaps send you back to “${l.title}”.`),
      ],
    })
  })
}

/* ── Coding problems ── */
for (const c of D.CP) {
  packs.push({
    key: `cg-cp-${c.id}`,
    kind: 'coding',
    title: `Code · ${c.title}`,
    summary: `${c.diff} · ${c.tags}. Try it before you open the approach.`,
    track: 'DSA',
    cards: [
      card('HOOK', `${c.diff} · ${c.tags}`, `${c.stmt}\n\n**Example:** ${c.ex}\n\nTry it on paper for ten minutes before turning the card.`),
      card('CONCEPT', 'Approach', c.approach),
      card('CODE', 'Reference solution (C++)', 'Read it, cover it, then write it from memory. Translate it to Java or C once — the exam allows C, C++ or Java.', { codeSnippet: c.code, codeLang: 'cpp' }),
      card('SUMMARY', 'To remember', `**Pattern:** ${c.tags}. **Level:** ${c.diff}.\n\nCan you re-solve it from a blank page, handling the empty input and the single-element case? If not, repeat it tomorrow.`),
    ],
  })
}

/* ── Debugging challenges ── */
const bugMark = /\/\/@\s*$/
for (const d of D.DBG) {
  const raw = d.code.split('\n')
  const bugIdx = []
  const clean = raw.map((ln, i) => (bugMark.test(ln) ? (bugIdx.push(i), ln.replace(/\s*\/\/@\s*$/, '')) : ln))
  const where = bugIdx.map((i) => `line ${i + 1}: \`${clean[i].trim()}\``).join('; ')
  packs.push({
    key: `cg-dbg-${d.id}`,
    kind: 'debug',
    title: `Debug · ${d.title} (${d.lang})`,
    summary: `${d.lvl} ${d.lang} bug hunt. Find it, then check.`,
    track: 'CORE_CS',
    cards: [
      card('HOOK', `${d.lang} · ${d.lvl}`, `${d.desc}\n\nRead the code once, trace the sample input by hand, *then* look for the fault.`),
      card('CODE', 'The code', 'Where is the bug? Do not fix anything until you can say what the code does on the sample.', { codeSnippet: clean.join('\n'), codeLang: { C: 'c', 'C++': 'cpp', Java: 'java', JavaScript: 'javascript' }[d.lang] ?? 'text' }),
      card('CHECK', 'Find and fix', `Q: Which line is wrong, and what is the minimal fix?\n\nA: ${where ? `**${where}**` : ''}\n\n**Fix:** \`${d.fix.trim()}\`\n\n${d.why}`),
      card('SUMMARY', 'The habit', 'Review → Identify → Fix → Validate. Re-run the sample *and* one edge case after the fix, and keep the fix minimal.'),
    ],
  })
}

/* ── Interview flashcards ── */
const IQ_ORDER = ['OOP', 'DBMS', 'OS', 'CN', 'Web', 'Cloud', 'Agile', 'Git', 'Security', 'AI', 'DSA', 'HR']
const IQ_NAME = { OOP: 'OOP', DBMS: 'DBMS & SQL', OS: 'Operating systems', CN: 'Computer networks', Web: 'Web & APIs', Cloud: 'Cloud & DevOps', Agile: 'Agile', Git: 'Git', Security: 'Security', AI: 'AI & prompting', DSA: 'DSA', HR: 'HR & behavioural' }
const iqKeys = new Map()
for (const cat of IQ_ORDER) {
  const qs = D.IQ.filter((x) => x[0] === cat)
  if (!qs.length) continue
  const parts = balanced(qs.length)
  iqKeys.set(cat, parts.map((_, i) => `cg-iq-${cat.toLowerCase()}${parts.length > 1 ? `-${i + 1}` : ''}`))
  parts.forEach(([from, to], i) => {
    packs.push({
      key: iqKeys.get(cat)[i],
      kind: 'interview',
      title: `Interview · ${IQ_NAME[cat]}` + (parts.length > 1 ? ` (part ${i + 1}/${parts.length})` : ''),
      summary: `${to - from} likely interview questions with crisp model answers.`,
      track: cat === 'HR' ? 'WRITING' : 'CORE_CS',
      cards: [
        card('HOOK', 'How to use these', 'Answer each question *aloud* in 30–45 seconds before you reveal. Interviewers want a definition, one example and one trade-off — in that order.'),
        ...qs.slice(from, to).map(([, q, ans], k) => card('CHECK', `${IQ_NAME[cat]} · ${from + k + 1}`, `Q: ${q}\n\nA: ${ans}`)),
        card('SUMMARY', 'After the round', 'Mark the ones you stumbled on and say those answers aloud twice more. Fluency, not memorised wording, is what scores.'),
      ],
    })
  })
}
const unknownCats = [...new Set(D.IQ.map((x) => x[0]))].filter((c) => !IQ_ORDER.includes(c))
if (unknownCats.length) throw new Error('unknown interview categories: ' + unknownCats)

/* ── Prompt-engineering tasks + AI-assisted coding simulations ── */
for (const p of D.PT) {
  const checks = p.keys.map((k) => `- ${D.PCHECK[k][0]}`).concat((p.extra ?? []).map((e) => `- ${e[0]}`)).join('\n')
  packs.push({
    key: `cg-pt-${p.id}`,
    kind: 'prompt',
    title: `Prompt lab · ${p.title}`,
    summary: 'Write the prompt yourself, then compare with a strong model prompt.',
    track: 'GENAI',
    cards: [
      card('HOOK', 'The task', p.task),
      card('CONCEPT', 'A strong prompt includes', checks),
      card('CHECK', 'Your turn', `Q: Write your prompt now (on paper or in notes) — then reveal the model prompt and tick off the list.\n\nA: ${fence(p.model)}`),
      card('SUMMARY', 'To remember', 'Graders look for: a clear role and language, a precise task, the exact interface, constraints, named edge cases, an output format, and a request for tests. Specific beats long.'),
    ],
  })
}
for (const s of D.SIMS) {
  const cards = [card('HOOK', `${s.time} minutes`, `${s.problem}\n\nThe round is graded on your process — understanding, prompting, reviewing the AI's output, and testing — not just the final code.`)]
  for (const st of s.steps) {
    const title = st.q.split(/ — | - /)[0]
    const body = st.q.replace(/^Step \d+ — /, '')
    if (st.type === 'mcq') cards.push(card('CHECK', title, mcqBody({ q: body, o: st.o, a: st.a, e: st.e, c: '' })))
    else if (st.type === 'tests') cards.push(card('CHECK', title, mcqBody({ q: body + ' (choose all that apply)', o: st.o, a: st.a, e: st.e, c: '' })))
    else if (st.type === 'prompt') cards.push(card('CHECK', title, `Q: ${body}\n\nA: ${fence(st.model)}\n\nStrong prompts cover: ${st.keys.map((k) => D.PCHECK[k][0].split(' (')[0].toLowerCase()).join('; ')}.`))
    else if (st.type === 'review') {
      const raw = st.code.split('\n')
      const bugIdx = []
      const clean = raw.map((ln, i) => (bugMark.test(ln) ? (bugIdx.push(i), ln.replace(/\s*\/\/@\s*$/, '')) : ln))
      const where = bugIdx.map((i) => `line ${i + 1}: \`${clean[i].trim()}\``).join('; ')
      cards.push(card('CHECK', title, `Q: ${body}\n\nA: ${where ? `**${where}**\n\n` : ''}${st.why}`, { codeSnippet: clean.join('\n'), codeLang: { C: 'c', 'C++': 'cpp', Java: 'java', JavaScript: 'javascript' }[st.lang] ?? 'text' }))
    } else throw new Error(`unknown sim step type ${st.type}`)
  }
  cards.push(card('SUMMARY', 'The workflow', 'Understand the problem → write a precise prompt → read what comes back → review it line by line → test the edge cases. Never accept AI output you have not run or traced.'))
  packs.push({ key: `cg-sim-${s.id}`, kind: 'prompt', title: `AI-assisted coding · ${s.title}`, summary: `A ${s.time}-minute walk-through of the whole round: understand, prompt, review, test.`, track: 'GENAI', cards })
}

/* ── English ── */
const EN_METHOD = D.L.find((l) => l.id === 'e7')
void EN_METHOD
const dictSets = []
for (let i = 0; i < D.DICT.length; i += 10) dictSets.push(D.DICT.slice(i, i + 10))
dictSets.forEach((set, i) => {
  packs.push({
    key: `cg-en-dict-${i + 1}`,
    kind: 'english',
    title: `English · Listen & repeat set ${i + 1}`,
    summary: 'Ten workplace sentences: read, cover, repeat from memory — chunk by meaning.',
    track: 'WRITING',
    cards: [
      card('HOOK', 'The method', 'Repeat tasks play a sentence once, so memorise **chunks of meaning**, not words. Read a sentence, cover it, say it back at once with the same rhythm — or have a friend read it aloud while you write it down.'),
      card('EXAMPLE', 'Sentences 1–5', set.slice(0, 5).map((s, k) => `${k + 1}. ${s}`).join('\n')),
      card('EXAMPLE', 'Sentences 6–10', set.slice(5).map((s, k) => `${k + 6}. ${s}`).join('\n')),
      card('SUMMARY', 'Check yourself', 'Did you keep plurals (-s) and past tense (-ed)? Content words first, small words second. Partial credit beats silence — always say something.'),
    ],
  })
})
packs.push({
  key: 'cg-en-read',
  kind: 'english',
  title: 'English · Read-aloud passages',
  summary: 'Eight short business passages for pace, pauses and clear stress.',
  track: 'WRITING',
  cards: [
    card('HOOK', 'The method', 'The AI scores clarity, pace and completeness. Read at a steady, slightly slower than natural pace, pause at commas and full stops, and never go back to fix a slip — continue.'),
    ...D.READ.map((r, i) => card('EXAMPLE', `Passage ${i + 1}`, `${r}`)),
    card('SUMMARY', 'Before you move on', 'Record yourself once. Listen for: swallowed word endings, flat pitch, and rushing the last line. Fix one thing per attempt.'),
  ],
})
const topicChunks = []
for (let i = 0; i < D.TOPICS.length; i += 5) topicChunks.push(D.TOPICS.slice(i, i + 5))
packs.push({
  key: 'cg-en-speak',
  kind: 'english',
  title: 'English · Speak for 60 seconds',
  summary: 'Twenty-five speaking prompts and the PREP frame that fits 60–90 seconds.',
  track: 'WRITING',
  cards: [
    card('HOOK', 'The PREP frame', '**P**oint — answer in one sentence. **R**eason — why. **E**xample — one concrete case. **P**oint — restate it. That is 60–90 seconds, and it never leaves you stuck for words.'),
    ...topicChunks.map((tc, i) => card('EXAMPLE', `Topics ${i * 5 + 1}–${i * 5 + tc.length}`, tc.map((t, k) => `${i * 5 + k + 1}. ${t}`).join('\n'))),
    card('SUMMARY', 'Habits', 'Take 60 seconds to plan, then speak without long silences. Replace fillers (um, like, basically) with a short pause. Never stay silent — a partial answer still scores.'),
  ],
})
for (const e of D.EMAILS) {
  packs.push({
    key: `cg-em-${e.id}`,
    kind: 'english',
    title: `Email · ${e.title}`,
    summary: 'A writing-round email: draft it yourself, then compare with a model answer.',
    track: 'WRITING',
    cards: [
      card('HOOK', 'The scenario', e.prompt),
      card('CONCEPT', 'The scoring checklist', e.points.map((p) => `- ${p[0]}`).join('\n')),
      card('CHECK', 'Your turn', `Q: Write the email (about 120 words) before you reveal the model answer.\n\nA: ${fence(e.model)}`),
      card('SUMMARY', 'To remember', 'Specific subject line, formal greeting, cause → impact → action → prevention, one clear call to action with a time, and a professional closing.'),
    ],
  })
}

/* The source page's lessons occasionally point at ITS OWN tabs ("the Practice tab", "the Games tab"). Those mechanics
   are not in this app, so each such sentence is rewritten to point at what exists here. Every rewrite is asserted:
   if the source text changes, the build fails instead of silently shipping a dead reference. */
const REWRITES = [
  ["Use the Listening drill in the Practice tab: it speaks sentences with your browser's voice; type what you hear; it scores word accuracy.", "Use the “English · Listen & repeat” packs in Learn: read a sentence, cover it, repeat it back at once (or have a friend read it while you write it down)."],
  ['Practice in the **Games** tab → Grid Challenge (levels grow from 3 to 7 dots).', 'The Grid Challenge game itself is not in this app — practise it on the original prep page (levels grow from 3 to 7 dots).'],
  ['Practice in the **Games** tab → Motion Challenge. The simulator computes the optimal move count with BFS and compares your moves.', 'The Motion Challenge game itself is not in this app — practise it on the original prep page, where the simulator compares your moves with the optimal (BFS) count.'],
  ['Open the **Interview** tab for 80+ flashcards across OOP, DBMS, OS, CN, Web, Cloud, AI, DSA and HR. Flip, self-rate, and repeat the ones you missed.', 'Open the **Interview** packs in Learn (Library → Capgemini → Interview) for 80+ flashcards across OOP, DBMS, OS, CN, Web, Cloud, AI, DSA and HR. Reveal each answer, mark the ones you missed, and repeat those.'],
]
const hits = new Map(REWRITES.map(([from]) => [from, 0]))
for (const p of packs) {
  if (p.kind !== 'lesson') continue
  for (const c of p.cards) {
    for (const [from, to] of REWRITES) {
      if (!c.body.includes(from)) continue
      c.body = c.body.replace(from, to)
      hits.set(from, hits.get(from) + 1)
    }
  }
}
for (const [from, n] of hits) if (n !== 1) throw new Error(`rewrite matched ${n} times (expected 1): ${from.slice(0, 60)}…`)

/* ── The exam at a glance: the page keeps this table outside its data arrays, so read it from the source text ── */
{
  const raw = readFileSync(src, 'utf8')
  const m = /const PATTERN = `([\s\S]*?)`;/.exec(raw)
  if (!m) throw new Error('PATTERN block not found in the source page')
  const frag = parseFragment(m[1])
  const rows = []
  const walkRows = (n) => {
    for (const c of n.childNodes ?? []) {
      if (c.tagName === 'tr') rows.push(c.childNodes.filter((x) => x.tagName === 'td' || x.tagName === 'th').map((x) => tidy(textOf(x))))
      else walkRows(c)
    }
  }
  walkRows(frag)
  const stages = rows.slice(1) // drop the header row
  if (stages.length < 5 || stages.some((r) => r.length !== 4)) throw new Error('unexpected shape of the exam-pattern table')
  const noteEl = (function find(n) {
    for (const c of n.childNodes ?? []) {
      if (c.tagName === 'p') return c
      const f = find(c)
      if (f) return f
    }
  })(frag)
  const note = tidy(inline(noteEl.childNodes))
  packs.push({
    key: 'cg-pattern',
    kind: 'lesson',
    title: 'Capgemini 2027 · the exam at a glance',
    summary: 'The reported stages, formats and timings — and where that information comes from.',
    track: 'CORE_CS',
    cards: [
      card('HOOK', 'The process, in order', `As candidates report it: ${stages.map((r) => r[1].replace(/\s*\(.*$/, '')).join(' → ')}.`),
      card('CONCEPT', 'Stage by stage', stages.map((r) => `- **${r[1]}** — ${r[2]} (${r[3]})`).join('\n')),
      card('WARNING', 'Where this comes from', note),
      card('SUMMARY', 'How to use it', 'Every stage above has its own lessons and drills in the 60-day schedule. Check the exam date and format against your own invitation as soon as you have it, and edit the exam milestone in Calendar if it differs.'),
    ],
  })
}

for (const [i, p] of packs.entries()) if (packs.findIndex((q) => q.key === p.key) !== i) throw new Error('duplicate pack key ' + p.key)
problems(packs, 'build')

/* ───────────── 4. The 60-day schedule ───────────── */
const packByKey = new Map(packs.map((p) => [p.key, p]))
const pkOf = (kind, id) => `cg-${kind}-${id}`
const need = (key) => {
  if (!packByKey.has(key)) throw new Error('plan refers to a pack that does not exist: ' + key)
  return key
}
/* Free-text tasks that name the page's own tabs are rewritten for this app (asserted: each must match exactly once). */
const TASK_REWRITES = new Map([
  ['Read the 2027 pattern on the Today tab and set your exam date in Progress → Settings', ['Read “Capgemini 2027 · the exam at a glance”, then confirm the real exam date from your invitation and edit the exam milestone in Calendar if it differs from the placeholder', 'cg-pattern']],
  ['Redo every question you got wrong this week (Progress → topic accuracy)', ['Redo every drill question you got wrong this week, and say why you missed each one']],
  ['Open Progress → weakest topics; re-read those lessons and run their topic drills until 80%+', ['Pick your weakest topics from the drills so far; re-read those lessons and redo their drills until you score 80%+ without peeking']],
])
const TASK_HITS = new Set()
const counters = { dict: 0, read: 0, speak: 0 }
const dbxPool = D.DBG.filter((d) => d.lang !== 'JavaScript' && d.lvl !== 'Easy')
const days = D.PLAN.map((d, i) => {
  const n = i + 1
  const lessons = (d.l ?? []).map((id) => need(pkOf('lesson', id)))
  const drillsNew = (d.l ?? []).flatMap((id) => drillKeyFor.get(id) ?? [])
  const drillsRev = [...new Set(d.q ?? [])].filter((t) => !(d.l ?? []).includes(t)).flatMap((t) => drillKeyFor.get(t) ?? [])
  const refs = [] // practice packs
  const practice = [] // {text, pack?}
  const outside = [] // things the app doesn't do
  for (const code of d.k) {
    const [ty, x, y] = code.split(':')
    const rest = code.slice(ty.length + 1)
    if (ty === 'X' && TASK_REWRITES.has(rest)) {
      const [text, pack] = TASK_REWRITES.get(rest)
      TASK_HITS.add(rest)
      practice.push(pack ? { text, pack } : { text })
      if (pack) refs.push(need(pack))
    } else if (ty === 'X') practice.push({ text: rest })
    else if (ty === 'CP') {
      refs.push(need(pkOf('cp', x)))
      practice.push({ text: 'Coding problem: ' + D.CP.find((c) => c.id === x).title, pack: pkOf('cp', x) })
    }
    else if (ty === 'DB') {
      refs.push(need(pkOf('dbg', x)))
      practice.push({ text: 'Debugging: ' + D.DBG.find((c) => c.id === x).title, pack: pkOf('dbg', x) })
    }
    else if (ty === 'DBX') {
      const dd = dbxPool[Number(x) % dbxPool.length]
      refs.push(need(pkOf('dbg', dd.id)))
      practice.push({ text: `Timed debugging round (20 minutes, exam conditions): ${dd.title}`, pack: pkOf('dbg', dd.id) })
    } else if (ty === 'PT') {
      refs.push(need(pkOf('pt', x)))
      practice.push({ text: 'Prompt lab: ' + D.PT.find((c) => c.id === x).title, pack: pkOf('pt', x) })
    }
    else if (ty === 'SIM') {
      refs.push(need(pkOf('sim', x)))
      practice.push({ text: 'AI-assisted coding walk-through: ' + D.SIMS.find((c) => c.id === x).title, pack: pkOf('sim', x) })
    }
    else if (ty === 'EN' && x === 'email') {
      refs.push(need(pkOf('em', y)))
      practice.push({ text: 'Email writing: ' + D.EMAILS.find((c) => c.id === y).title, pack: pkOf('em', y) })
    }
    else if (ty === 'EN' && x === 'dict') {
      const k = (counters.dict++ % dictSets.length) + 1
      refs.push(need(`cg-en-dict-${k}`))
      practice.push({ text: `Listen & repeat: set ${k}`, pack: `cg-en-dict-${k}` })
    } else if (ty === 'EN' && x === 'read') {
      const i1 = (counters.read++ * 2) % D.READ.length
      refs.push(need('cg-en-read'))
      practice.push({ text: `Read aloud: passages ${i1 + 1} and ${(i1 + 1) % D.READ.length + 1}`, pack: 'cg-en-read' })
    } else if (ty === 'EN' && x === 'speak') {
      const t = D.TOPICS[counters.speak++ % D.TOPICS.length]
      refs.push(need('cg-en-speak'))
      practice.push({ text: `Speak for 60 seconds (plan 60 s first): “${t}”`, pack: 'cg-en-speak' })
    } else if (ty === 'IQ') {
      const cats = x === 'ALL' ? IQ_ORDER : [x]
      for (const c of cats) for (const k of iqKeys.get(c) ?? (() => { throw new Error('no IQ pack for ' + c) })()) refs.push(need(k))
      practice.push({ text: x === 'ALL' ? 'Interview flashcards: every category, out loud' : `Interview flashcards: ${IQ_NAME[x]}, out loud`, pack: iqKeys.get(x === 'ALL' ? 'OOP' : x)[0] })
    } else if (ty === 'SEC') {
      const s = D.SECT[x]
      const topics = s.special ? [...D.SECT.ai.topics, ...D.SECT.dsa.topics, ...D.SECT.logic.topics] : s.topics
      const dk = topics.flatMap((t) => drillKeyFor.get(t) ?? [])
      practice.push({ text: `Section test — ${s.name}: ${s.n} questions in ${s.min} minutes. Work through the drill packs for this section as one timed sitting, no peeking.` })
      for (const k of dk) refs.push(need(k))
    } else if (ty === 'MOCK') {
      practice.push({ text: `Full mock ${x} as one timed sitting: English (25 min) → Technical, 40 MCQs (45 min) → Debugging (20 min) → AI-assisted coding (25 min). Use the drill, debug and simulation packs; write down why each miss happened.` })
    } else if (ty === 'G') {
      outside.push({ grid: 'Grid challenge', motion: 'Motion challenge', switch: 'Switch challenge', deduct: 'Logical deduction', series: 'Series & patterns', digit: 'Digit challenge' }[x] ?? x)
    } else throw new Error('unhandled plan task ' + code)
  }
  const sec = lessons.length ? D.L.find((l) => pkOf('lesson', l.id) === lessons[0]).sec : null
  const first = lessons[0] ? D.L.find((l) => pkOf('lesson', l.id) === lessons[0]) : null
  const track = first ? trackOf(first.sec, first.id) : 'CORE_CS'
  void sec
  return { n, title: d.t, track, lessons, drills: [...new Set([...drillsNew, ...drillsRev])], practice, outside, refs: [...new Set(refs)] }
})

for (const k of TASK_REWRITES.keys()) if (!TASK_HITS.has(k)) throw new Error('task rewrite did not match: ' + k)

/* tag packs with the plan days that schedule them */
const daysOf = new Map()
for (const d of days) for (const k of [...d.lessons, ...d.drills, ...d.refs]) daysOf.set(k, [...(daysOf.get(k) ?? []), d.n])
for (const p of packs) p.days = [...new Set(daysOf.get(p.key) ?? [])].sort((x, y) => x - y)
const unscheduled = packs.filter((p) => !p.days.length).map((p) => p.key)

/* ───────────── 5. Write ───────────── */
const out = {
  source: 'capgemini-2027-prep.html (candidate-reported 2027 pattern; Capgemini has not published it officially)',
  counts: { packs: packs.length, cards: packs.reduce((n, p) => n + p.cards.length, 0), days: days.length },
  packs: packs.map(({ days: dd, ...p }) => ({ ...p, days: dd })),
  days: days.map((d) => ({ n: d.n, title: d.title, track: d.track, lessons: d.lessons, drills: d.drills, practice: d.practice, outside: d.outside })),
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out) + '\n')
const byKind = {}
for (const p of packs) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1
console.log('wrote', OUT)
console.log(out.counts, byKind)
console.log('packs never scheduled (available in the library only):', unscheduled.length ? unscheduled.join(', ') : 'none')
console.log('size', Math.round(JSON.stringify(out).length / 1024), 'KB')
