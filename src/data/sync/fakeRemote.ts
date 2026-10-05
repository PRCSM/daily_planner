import { RemoteError, type PullResult, type PushRow, type Remote, type RemoteRow } from '@/lib/remote'

/** In-memory stand-in for the Supabase mirror, with the same LWW + seq semantics as sync_push(). Test-only. */
export class FakeRemote implements Remote {
  rows = new Map<string, RemoteRow>()
  seq = 0
  offline = false
  failWith: RemoteError | null = null
  pushCalls: PushRow[][] = []
  pullCalls = 0
  /** Runs once inside push(), before applying — to simulate an edit landing during an in-flight push. */
  duringPush: (() => Promise<void>) | null = null

  private gate() {
    if (this.offline) throw new RemoteError('OFFLINE', 'network down')
    if (this.failWith) throw this.failWith
  }

  async push(rows: PushRow[]): Promise<void> {
    this.gate()
    this.pushCalls.push(rows)
    if (this.duringPush) {
      const f = this.duringPush
      this.duringPush = null
      await f()
    }
    for (const r of rows) {
      const key = `${r.table}:${r.id}`
      const cur = this.rows.get(key)
      if (cur && !(cur.updatedAt < r.updatedAt)) continue // older or equal: ignored, like the SQL `where` clause
      this.rows.set(key, { table: r.table, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, data: structuredClone(r.data), seq: ++this.seq })
    }
  }

  async pull(sinceSeq: number, limit: number): Promise<PullResult> {
    this.gate()
    this.pullCalls++
    const rows = [...this.rows.values()].filter((r) => r.seq > sinceSeq).sort((a, b) => a.seq - b.seq).slice(0, limit)
    return { rows: structuredClone(rows), maxSeq: rows.reduce((m, r) => Math.max(m, r.seq), sinceSeq) }
  }
}
