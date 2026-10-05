import { db } from '../db'
import { alive, getAlive, listAlive, makeRow, patchRow, putRow, runTx, softDelete } from '../rows'
import { detId } from '@/lib/ids'
import type { ChatContext } from '@/lib/enums'
import type { ChatMessageRow, ChatThreadRow, ContentCardRow, ContentPackRow, PackProgressRow } from '../types'
import type { ValidPack } from '@/lib/packSchema'

export const allQuotes = () => listAlive('dailyQuotes')
export const setQuoteSaved = (id: string, saved: boolean) => patchRow('dailyQuotes', id, { saved })

export const allPacks = () => listAlive('contentPacks')
export const getPack = (id: string) => getAlive('contentPacks', id)
export async function cardsForPack(packId: string): Promise<ContentCardRow[]> {
  return alive(await db.contentCards.where('packId').equals(packId).toArray()).sort((a, b) => a.orderIndex - b.orderIndex)
}

/** Persist a pack that has ALREADY passed validatePack*. One transaction: pack + cards or nothing. */
export async function savePack(valid: ValidPack, meta: { topic: string; track?: ContentPackRow['track']; weekNumber?: number; tags: string[]; source: ContentPackRow['source'] }): Promise<ContentPackRow> {
  return runTx(['contentPacks', 'contentCards'], async () => {
    const pack = await putRow(
      'contentPacks',
      makeRow<ContentPackRow>({
        title: valid.title,
        summary: valid.summary,
        topic: meta.topic,
        track: meta.track,
        weekNumber: meta.weekNumber,
        tags: meta.tags,
        source: meta.source,
        totalCards: valid.cards.length,
        estimatedMinutes: Math.max(2, Math.round(valid.cards.reduce((n, c) => n + c.body.length + (c.codeSnippet?.length ?? 0), 0) / 900)),
        seeded: false,
        userModified: false,
      }),
    )
    for (const c of valid.cards) {
      await putRow('contentCards', makeRow<ContentCardRow>({ packId: pack.id, orderIndex: c.orderIndex, type: c.type, heading: c.heading, body: c.body, codeSnippet: c.codeSnippet, codeLang: c.codeLang, seeded: false, userModified: false }))
    }
    return pack
  })
}
export const removePack = (id: string) => softDelete('contentPacks', id)

export async function getProgress(packId: string, date: string): Promise<PackProgressRow | undefined> {
  const rows = alive(await db.packProgress.where('packId').equals(packId).toArray())
  return rows.find((r) => r.date === date)
}
export async function allProgress(): Promise<PackProgressRow[]> {
  return alive(await db.packProgress.toArray())
}
export async function saveProgress(packId: string, date: string, patch: Partial<Pick<PackProgressRow, 'cardsViewed' | 'cardsTotal' | 'completed' | 'minutesSpent'>>): Promise<PackProgressRow> {
  const existing = await getProgress(packId, date)
  if (existing) return patchRow('packProgress', existing.id, patch)
  return putRow('packProgress', makeRow<PackProgressRow>({ packId, date, cardsViewed: 0, cardsTotal: 0, completed: false, minutesSpent: 0, ...patch }, detId('packProgress', packId, date)))
}

export async function allThreads(): Promise<ChatThreadRow[]> {
  return alive(await db.chatThreads.orderBy('updatedAt').reverse().toArray())
}
export const createThread = (title: string, contextType: ChatContext, contextId?: string, contextExcerpt?: string) =>
  putRow('chatThreads', makeRow<ChatThreadRow>({ title, contextType, contextId, contextExcerpt }))
export async function messagesFor(threadId: string): Promise<ChatMessageRow[]> {
  return alive(await db.chatMessages.where('threadId').equals(threadId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
export async function addMessage(threadId: string, role: ChatMessageRow['role'], content: string): Promise<ChatMessageRow> {
  return runTx(['chatMessages', 'chatThreads'], async () => {
    const m = await putRow('chatMessages', makeRow<ChatMessageRow>({ threadId, role, content }))
    await patchRow('chatThreads', threadId, {}) // bump updatedAt so the thread sorts first
    return m
  })
}
export const removeThread = (id: string) => softDelete('chatThreads', id)
