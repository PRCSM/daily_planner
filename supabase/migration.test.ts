// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * Runs the REAL migration against a real Postgres (PGlite/WASM) with a minimal stand-in for Supabase's
 * `auth` schema, then exercises RLS and the last-write-wins push function as two different users.
 */
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const ROW = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let pg: PGlite
const as = async (uid: string | null) => {
  await pg.exec(`reset role; ${uid ? `select set_config('request.jwt.claim.sub', '${uid}', false);` : `select set_config('request.jwt.claim.sub', '', false);`} set role ${uid ? 'authenticated' : 'anon'};`)
}
const push = (rows: unknown[]) => pg.query<{ sync_push: number }>('select public.sync_push($1::jsonb) as sync_push', [JSON.stringify(rows)])
const row = (n: number, updatedAt: string, title = 't', table = 'events', deletedAt: string | null = null) => ({ table, id: ROW(n), updatedAt, deletedAt, data: { id: ROW(n), title, updatedAt } })

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select on auth.users to authenticated;
    insert into auth.users values ('${U1}'), ('${U2}');
  `)
  await pg.exec(readFileSync(join(process.cwd(), 'supabase/migrations/0001_init.sql'), 'utf8'))
})

describe('migration', () => {
  it('RLS is enabled and forced on the mirror table', async () => {
    const r = await pg.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>("select relrowsecurity, relforcerowsecurity from pg_class where relname = 'sync_rows'")
    expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true })
  })
  it('anonymous callers can neither read nor push', async () => {
    await as(null)
    await expect(pg.query('select * from public.sync_rows')).rejects.toThrow(/permission denied/)
    await expect(push([row(1, '2026-01-01T00:00:00Z')])).rejects.toThrow()
  })
})

describe('sync_push: last-write-wins', () => {
  it('inserts new rows under the CALLER’s id and reports how many were applied', async () => {
    await as(U1)
    const r = await push([row(1, '2026-01-01T00:00:00.000Z', 'v1'), row(2, '2026-01-01T00:00:00.000Z', 'other')])
    expect(r.rows[0]!.sync_push).toBe(2)
    const rows = await pg.query<{ user_id: string }>('select user_id from public.sync_rows')
    expect(rows.rows.every((x) => x.user_id === U1)).toBe(true)
  })
  it('applies a NEWER row, ignores an OLDER one, ignores an EQUAL one', async () => {
    await as(U1)
    expect((await push([row(1, '2026-01-02T00:00:00.000Z', 'v2')])).rows[0]!.sync_push).toBe(1)
    expect((await push([row(1, '2026-01-01T12:00:00.000Z', 'stale')])).rows[0]!.sync_push).toBe(0)
    expect((await push([row(1, '2026-01-02T00:00:00.000Z', 'same-ts')])).rows[0]!.sync_push).toBe(0)
    const r = await pg.query<{ data: { title: string } }>(`select data from public.sync_rows where row_id = '${ROW(1)}'`)
    expect(r.rows[0]!.data.title).toBe('v2')
  })
  it('every applied write advances seq (the pull watermark), ignored writes do not', async () => {
    await as(U1)
    const seq = async () => (await pg.query<{ seq: string }>(`select seq from public.sync_rows where row_id = '${ROW(1)}'`)).rows[0]!.seq
    const before = BigInt(await seq())
    await push([row(1, '2026-01-01T00:00:00.000Z', 'old')])
    expect(BigInt(await seq())).toBe(before)
    await push([row(1, '2026-02-01T00:00:00.000Z', 'new')])
    expect(BigInt(await seq()) > before).toBe(true)
  })
  it('soft deletes sync: deleted_at is stored and can be pulled', async () => {
    await as(U1)
    await push([row(3, '2026-01-01T00:00:00.000Z', 'x')])
    await push([row(3, '2026-01-05T00:00:00.000Z', 'x', 'events', '2026-01-05T00:00:00.000Z')])
    const r = await pg.query<{ deleted_at: string | null }>(`select deleted_at from public.sync_rows where row_id = '${ROW(3)}'`)
    expect(r.rows[0]!.deleted_at).not.toBeNull()
  })
  it('rejects unknown tables, non-arrays and oversized batches', async () => {
    await as(U1)
    await expect(push([row(9, '2026-01-01T00:00:00Z', 't', 'pg_authid')])).rejects.toThrow(/sync_rows_table_name_chk/)
    await expect(pg.query(`select public.sync_push('{"a":1}'::jsonb)`)).rejects.toThrow(/json array/)
    const big = Array.from({ length: 501 }, (_, i) => row(1000 + i, '2026-01-01T00:00:00Z'))
    await expect(push(big)).rejects.toThrow(/too many rows/)
  })
})

describe('row level security: a row is readable/writable only by its owner', () => {
  it('user 2 cannot see user 1’s rows', async () => {
    await as(U2)
    const r = await pg.query('select * from public.sync_rows')
    expect(r.rows).toHaveLength(0)
  })
  it('user 2 pushing the SAME row id creates their own row — it never touches user 1’s', async () => {
    await as(U2)
    await push([row(1, '2099-01-01T00:00:00.000Z', 'hijack')])
    await as(U1)
    const mine = await pg.query<{ data: { title: string } }>(`select data from public.sync_rows where row_id = '${ROW(1)}'`)
    expect(mine.rows).toHaveLength(1)
    expect(mine.rows[0]!.data.title).toBe('new')
    await as(U2)
    const theirs = await pg.query<{ data: { title: string } }>('select data from public.sync_rows')
    expect(theirs.rows.map((r) => r.data.title)).toEqual(['hijack'])
  })
  it('a direct INSERT claiming another user_id is refused by the policy', async () => {
    await as(U2)
    await expect(pg.query(`insert into public.sync_rows (user_id, table_name, row_id, data, client_updated_at) values ('${U1}', 'events', '${ROW(77)}', '{}', now())`)).rejects.toThrow(/row-level security/)
  })
  it('a direct UPDATE of another user’s row affects nothing; so does DELETE', async () => {
    await as(U2)
    const u = await pg.query(`update public.sync_rows set data = '{"x":1}' where user_id = '${U1}' returning 1`)
    expect(u.rows).toHaveLength(0)
    const d = await pg.query(`delete from public.sync_rows where user_id = '${U1}' returning 1`)
    expect(d.rows).toHaveLength(0)
    await as(U1)
    expect((await pg.query('select * from public.sync_rows')).rows.length).toBeGreaterThan(0)
  })
  it('an UPDATE cannot re-assign a row to someone else (with check)', async () => {
    await as(U1)
    await expect(pg.query(`update public.sync_rows set user_id = '${U2}' where row_id = '${ROW(2)}'`)).rejects.toThrow(/row-level security/)
  })
  it('sync_wipe deletes only the caller’s cloud rows', async () => {
    await as(U2)
    await pg.query('select public.sync_wipe()')
    expect((await pg.query('select * from public.sync_rows')).rows).toHaveLength(0)
    await as(U1)
    expect((await pg.query('select * from public.sync_rows')).rows.length).toBeGreaterThan(0)
  })
  it('pull by seq watermark returns only newer rows, in order', async () => {
    await as(U1)
    const all = await pg.query<{ seq: string }>('select seq from public.sync_rows order by seq')
    const mid = all.rows[0]!.seq
    const newer = await pg.query<{ seq: string }>('select seq from public.sync_rows where seq > $1 order by seq', [mid])
    expect(newer.rows.length).toBe(all.rows.length - 1)
  })
})

describe('the harness is not vacuous (planted defect)', () => {
  it('with RLS stripped from the migration, user 2 CAN read user 1’s rows — so the tests above would have caught it', async () => {
    const broken = new PGlite()
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0001_init.sql'), 'utf8')
      .replace(/alter table public\.sync_rows enable row level security;/, '')
      .replace(/alter table public\.sync_rows force row level security;/, '')
    await broken.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
      grant select on auth.users to authenticated; insert into auth.users values ('${U1}'), ('${U2}');
    `)
    await broken.exec(sql)
    await broken.exec(`select set_config('request.jwt.claim.sub', '${U1}', false); set role authenticated;`)
    await broken.query('select public.sync_push($1::jsonb)', [JSON.stringify([row(1, '2026-01-01T00:00:00Z')])])
    await broken.exec(`reset role; select set_config('request.jwt.claim.sub', '${U2}', false); set role authenticated;`)
    // policies exist but RLS is off → the policies are not enforced
    const leaked = await broken.query('select * from public.sync_rows')
    expect(leaked.rows.length).toBe(1)
  })
})
