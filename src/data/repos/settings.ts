import { db } from '../db'
import { makeRow, patchRow, putRow, runTx } from '../rows'
import { detId } from '@/lib/ids'
import type { AppSettingRow } from '../types'

/** Durable, backup-relevant settings (NOT secrets — keys never go here). */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db.appSettings.where('key').equals(key).first()
  return r && !r.deletedAt ? (r.value as T) : fallback
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing) await patchRow('appSettings', existing.id, { value, deletedAt: null })
  else await putRow('appSettings', makeRow<AppSettingRow>({ key, value }, detId('setting', key)))
}

/**
 * Atomic read-modify-write of a setting. Concurrent callers are serialised by the transaction, so two quick
 * updates (typing subjects fast, tapping a stepper twice) can never lose one another.
 */
export async function updateSetting<T>(key: string, fallback: T, fn: (cur: T) => T): Promise<T> {
  return runTx(['appSettings'], async () => {
    const next = fn(await getSetting<T>(key, fallback))
    await setSetting(key, next)
    return next
  })
}

/** Local-only blobs (e.g. the timetable reference photo). Stored in syncMeta: never synced, never exported. */
export async function saveLocalBlob(key: string, blob: Blob): Promise<void> {
  await db.syncMeta.put({ key: `blob:${key}`, value: blob })
}
export async function getLocalBlob(key: string): Promise<Blob | undefined> {
  const r = await db.syncMeta.get(`blob:${key}`)
  return r?.value instanceof Blob ? r.value : undefined
}
export async function deleteLocalBlob(key: string): Promise<void> {
  await db.syncMeta.delete(`blob:${key}`)
}
