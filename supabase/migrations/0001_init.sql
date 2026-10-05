-- Cadence cloud mirror.
--
-- Design: ONE generic mirror table instead of ~22 typed tables. The app is local-first (Dexie is the source
-- of truth); the cloud is a backup + second-device mirror, so rows are stored as jsonb documents keyed by
-- (user, table, row id). This survives schema drift in the client without a migration per release, and means
-- RLS is written once, on one table, and can be audited at a glance.
--
-- Conflict rule: last-write-wins per row on the client's `updatedAt` (client_updated_at). The push function
-- only applies an incoming row if it is NEWER than what's stored. Deletes are soft (deleted_at) so they sync.
-- Pull uses a monotonic server `seq` as the watermark (not a timestamp: timestamps tie and clocks skew).

create sequence if not exists public.sync_seq;

create table if not exists public.sync_rows (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  table_name        text        not null,
  row_id            uuid        not null,
  data              jsonb       not null,
  client_updated_at timestamptz not null,
  deleted_at        timestamptz,
  seq               bigint      not null default nextval('public.sync_seq'),
  primary key (user_id, table_name, row_id),
  constraint sync_rows_table_name_chk check (table_name in (
    'events', 'eventOccurrences', 'dailyLogs', 'logBlocks', 'dsaProblems', 'applications', 'weeklyTargets',
    'deliverables', 'weeklyReviews', 'timetableSlots', 'plannerDays', 'plannerTasks', 'dailyQuotes',
    'contentPacks', 'contentCards', 'packProgress', 'chatThreads', 'chatMessages', 'notes', 'noteBlocks',
    'appSettings', 'portals'
  )),
  constraint sync_rows_data_size_chk check (pg_column_size(data) < 262144)
);

create index if not exists sync_rows_user_seq_idx on public.sync_rows (user_id, seq);

-- ───────────── Row Level Security: a row is readable/writable only by its owner ─────────────
alter table public.sync_rows enable row level security;
alter table public.sync_rows force row level security;

drop policy if exists sync_rows_select_own on public.sync_rows;
drop policy if exists sync_rows_insert_own on public.sync_rows;
drop policy if exists sync_rows_update_own on public.sync_rows;
drop policy if exists sync_rows_delete_own on public.sync_rows;

create policy sync_rows_select_own on public.sync_rows for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_rows_insert_own on public.sync_rows for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_rows_update_own on public.sync_rows for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Hard delete is only for "delete all my cloud data"; the app itself soft-deletes.
create policy sync_rows_delete_own on public.sync_rows for delete to authenticated
  using (user_id = (select auth.uid()));

-- Anonymous callers get nothing at all.
revoke all on public.sync_rows from anon;
grant select, insert, update, delete on public.sync_rows to authenticated;
revoke all on sequence public.sync_seq from anon;
grant usage on sequence public.sync_seq to authenticated;

-- ───────────── Push: batch upsert, last-write-wins ─────────────
-- SECURITY INVOKER (the default): RLS applies to everything this function touches, and user_id is always
-- auth.uid() — a caller can never write another user's rows by passing a user_id.
-- p_rows: [{ "table": text, "id": uuid, "updatedAt": timestamptz-string, "deletedAt": string|null, "data": object }]
-- Returns the number of rows that were actually applied (older/equal incoming rows are ignored).
create or replace function public.sync_push(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        jsonb;
  applied  integer := 0;
  hit      integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'too many rows in one push (max 500)' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.sync_rows as s (user_id, table_name, row_id, data, client_updated_at, deleted_at, seq)
    values (
      auth.uid(),
      r ->> 'table',
      (r ->> 'id')::uuid,
      r -> 'data',
      (r ->> 'updatedAt')::timestamptz,
      nullif(r ->> 'deletedAt', '')::timestamptz,
      nextval('public.sync_seq')
    )
    on conflict (user_id, table_name, row_id) do update
      set data              = excluded.data,
          client_updated_at = excluded.client_updated_at,
          deleted_at        = excluded.deleted_at,
          seq               = nextval('public.sync_seq')
      where s.client_updated_at < excluded.client_updated_at;
    get diagnostics hit = row_count;
    applied := applied + hit;
  end loop;
  return applied;
end;
$$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- "Delete all my cloud data" (Settings → danger zone). Local data is untouched.
create or replace function public.sync_wipe()
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.sync_rows where user_id = auth.uid();
$$;
revoke all on function public.sync_wipe() from public, anon;
grant execute on function public.sync_wipe() to authenticated;
