import type { ContentCardRow, ContentPackRow, EventRow } from '@/data/types'
import type { Track } from '@/lib/enums'
import { CAPG_DAY_ONE, CAPG_DAYS, CAPG_EXAM_DEFAULT, CAPG_EXAM_SEED_KEY, CAPG_TAG, type CapgKind, capgDayTag, capgKindTag } from '@/lib/capgemini'
import { detId } from '@/lib/ids'
import { validatePackObject } from '@/lib/packSchema'
import type { EventSeed } from '../events'
import { PLAN_START, SEED_STAMP, addDaysStr } from '../util'

/**
 * Capgemini 2027 prep content, converted from the user's standalone prep page by scripts/extract-capgemini.mjs.
 * The data is one JSON document, loaded LAZILY (dynamic import → its own chunk): it is read only when the seed has
 * to run, never on a normal launch. It is first-party and committed, but it is still run through the SAME pack
 * validator as AI-generated packs before a single row is written.
 */
export interface CapgCard {
  type: ContentCardRow['type']
  heading?: string
  body: string
  codeSnippet?: string
  codeLang?: string
}
export interface CapgPack {
  key: string
  kind: CapgKind
  title: string
  summary: string
  track: Track
  cards: CapgCard[]
  days: number[]
}
export interface CapgDay {
  n: number
  title: string
  track: Track
  lessons: string[]
  drills: string[]
  practice: { text: string; pack?: string }[]
  outside: string[]
}
export interface CapgContent {
  source: string
  counts: { packs: number; cards: number; days: number }
  packs: CapgPack[]
  days: CapgDay[]
}

export async function loadCapgemini(): Promise<CapgContent> {
  const raw = (await import('./content.json?raw')).default
  return JSON.parse(raw) as CapgContent
}

const stamps = { createdAt: SEED_STAMP, updatedAt: SEED_STAMP, deletedAt: null, syncedAt: null }
const flags = { seeded: true, userModified: false }

const utcDow = (d: string): number => new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay()
const weekOf = (d: string): number => Math.floor((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${PLAN_START}T00:00:00Z`)) / (7 * 86_400_000)) + 1
export const capgDate = (n: number): string => addDaysStr(CAPG_DAY_ONE, n - 1)

/** Honest reading/working time per kind: a drill question takes about a minute; a coding problem is a sitting, not a read. */
function minutesFor(kind: CapgKind, cards: CapgCard[]): number {
  const chars = cards.reduce((n, c) => n + c.body.length + (c.codeSnippet?.length ?? 0), 0)
  switch (kind) {
    case 'drill': return Math.max(3, cards.filter((c) => c.type === 'CHECK').length)
    case 'interview': return Math.max(3, Math.round(cards.filter((c) => c.type === 'CHECK').length * 1.5))
    case 'coding': return 15
    case 'debug': return 10
    case 'prompt': return 10
    default: return Math.max(2, Math.round(chars / 900))
  }
}

const SLOT_WEEKDAY = { startTime: '17:30', endTime: '19:00' } as const
const SLOT_WEEKEND = { startTime: '15:00', endTime: '17:00' } as const

function dayNotes(d: CapgDay, titleOf: (key: string) => string): string {
  const lines: string[] = [`Capgemini prep · day ${d.n} of ${CAPG_DAYS}. Open Learn → Capgemini for today's packs.`]
  if (d.lessons.length) lines.push('', 'Learn:', ...d.lessons.map((k) => `• ${titleOf(k)}`))
  if (d.drills.length) {
    const shown = d.drills.slice(0, 3).map(titleOf)
    lines.push('', `Drills (${d.drills.length}): ${shown.join('; ')}${d.drills.length > 3 ? '; …' : ''}`)
  }
  if (d.practice.length) lines.push('', 'Practice:', ...d.practice.map((p) => `• ${p.text}`))
  if (d.outside.length) lines.push('', `Not in this app (use the original prep page): ${d.outside.join(', ')}`)
  return lines.join('\n')
}

export function buildCapgeminiRows(content: CapgContent) {
  const titleByKey = new Map(content.packs.map((p) => [p.key, p.title]))
  const titleOf = (k: string): string => {
    const t = titleByKey.get(k)
    if (!t) throw new Error(`capgemini: day refers to a missing pack ${k}`)
    return t
  }

  const contentPacks: ContentPackRow[] = []
  const contentCards: ContentCardRow[] = []
  const invalid: string[] = []
  for (const p of content.packs) {
    const v = validatePackObject({ title: p.title, summary: p.summary, cards: p.cards.map((c, i) => ({ orderIndex: i, ...c })) })
    if (!v.ok) {
      invalid.push(`${p.key}: ${v.errors.join('; ')}`)
      continue
    }
    const id = detId('seed:pack', p.key)
    const firstDay = p.days[0]
    contentPacks.push({
      id, ...stamps, ...flags,
      title: v.pack.title, track: p.track, topic: CAPG_TAG, summary: v.pack.summary,
      weekNumber: firstDay ? weekOf(capgDate(firstDay)) : undefined,
      tags: [CAPG_TAG, capgKindTag(p.kind), ...p.days.map(capgDayTag)],
      source: 'SEEDED', totalCards: v.pack.cards.length, estimatedMinutes: minutesFor(p.kind, p.cards),
    })
    for (const c of v.pack.cards) {
      contentCards.push({ id: detId('seed:card', p.key, c.orderIndex), ...stamps, ...flags, packId: id, orderIndex: c.orderIndex, type: c.type, heading: c.heading, body: c.body, codeSnippet: c.codeSnippet, codeLang: c.codeLang })
    }
  }

  const seeds: EventSeed[] = content.days.map((d) => {
    const date = capgDate(d.n)
    const weekend = utcDow(date) === 0 || utcDow(date) === 6
    return {
      key: `cg-day-${d.n}`,
      title: `Capgemini · day ${d.n}/${CAPG_DAYS} — ${d.title}`,
      type: 'STUDY_BLOCK',
      date,
      recurrence: 'NONE',
      ...(weekend ? SLOT_WEEKEND : SLOT_WEEKDAY),
      track: d.track,
      weekNumber: weekOf(date),
      criticality: 'SOFT',
      sourceModule: 'PLAN',
      notes: dayNotes(d, titleOf),
    }
  })
  seeds.push({
    key: CAPG_EXAM_SEED_KEY,
    title: 'Capgemini exam — confirm this date',
    type: 'MILESTONE',
    date: CAPG_EXAM_DEFAULT,
    recurrence: 'NONE',
    criticality: 'HARD',
    sourceModule: 'PLAN',
    weekNumber: weekOf(CAPG_EXAM_DEFAULT),
    caveat: 'Placeholder: the prep plan assumed 60 days from the start. Replace it with the date on your invitation (open this event and edit it).',
    notes: 'Stages as candidates report them: English communication → technical module → debugging → AI-assisted coding → cognitive → technical + HR interview. Capgemini has not published the format; read “Capgemini 2027 · the exam at a glance” in Learn.',
  })
  const events: EventRow[] = seeds.map(({ key, ...e }) => ({ id: detId('seed:event', key), ...stamps, ...flags, done: false, ...e }))
  return { contentPacks, contentCards, events, invalid }
}
