import { PACKS_CORE } from './packs-core'
import { PACKS_DSA } from './packs-dsa'

export type { PackSeed } from './pack-util'

/** 12 packs for weeks 1–4. Every one follows the 8-beat shape and passes the shared validator. */
export const PACKS = [...PACKS_CORE, ...PACKS_DSA].map((p) => ({
  ...p,
  cards: p.cards.map((card, i) => ({ ...card, orderIndex: i })),
}))
