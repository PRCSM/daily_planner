/** Random uuid (v4) and deterministic uuid for rows that must converge across devices. */

export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c && c.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  return hex(b)
}

function hex(b: Uint8Array): string {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** cyrb128 — small, fast, well-distributed 128-bit string hash. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

/**
 * Deterministic uuid from a namespace + key. Seeded rows and one-per-date rows
 * (dailyLogs, plannerDays, occurrence annotations…) use this so two devices that
 * create "the same" row converge on one id instead of colliding on a unique index.
 */
export function detId(namespace: string, ...parts: (string | number)[]): string {
  const [a, b, c, d] = cyrb128(`${namespace}\u0000${parts.join('\u0000')}`)
  const bytes = new Uint8Array(16)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, a)
  view.setUint32(4, b)
  view.setUint32(8, c)
  view.setUint32(12, d)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version-5-shaped
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return hex(bytes)
}
