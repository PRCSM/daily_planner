import { db } from '../db'
import { makeRow, patchRow, putRow } from '../rows'
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
