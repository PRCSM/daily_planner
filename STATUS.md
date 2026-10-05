# Cadence — STATUS

Offline-first PWA for an 18-week placement-prep plan. One unified `events` timeline viewed five ways.

**State: all 20 build steps are done and committed.** `npm run ci` is green: typecheck · lint · guards · 563 unit/integration
tests (48 files, 96% statement coverage overall, per-layer thresholds enforced) · production build. `npm run e2e` is green:
26 Playwright checks against the production build (6 flows + axe on 13 screens in dark and 7 in light).

## Build order

| # | Step | State |
|---|------|-------|
| 1 | Scaffold, TS strict, ESLint layer rules, PWA manifest + SW | done |
| 2 | Design tokens, spring motion, primitives, `/kitchen-sink` | done |
| 3 | Dexie schema, single write path, repositories, seed loader | done |
| 4 | Pure domain layer + tests (≥ 99% statements) | done |
| 5 | Supabase migration + RLS (tested on real Postgres via PGlite), sync worker + controller | done |
| 6 | App shell, floating nav capsule + FAB | done |
| 7 | Today (one-query bundle; review queue absent when empty) | done |
| 8 | Log sheet (pre-mounted, keyboard-first, autosave, backfill) | done |
| 9 | Calendar (shape markers, filters, agenda sheet, custom events, skip/move one occurrence) | done |
| 10 | Plan (pro-rata verdicts, burnout card, tri-state Sunday review) | done |
| 11 | Opportunities (shared caveats once, CLOSED sinks), portals | done |
| 12 | Applications (state machine, census) | done |
| 13 | Timetable (paint mode, reviewed `.ics`/`.csv` import, reference photo) | done |
| 14 | Planner (drag/resize, immovable barriers, columns, plan-tomorrow) | done |
| 15 | Progress (charts, AI-off meter, heatmap, DSA pattern matrix) | done |
| 16 | Learn offline (quote, week-matched pack, serif reader, library) | done |
| 17 | Learn AI (Edge Function, chat, pack generation) | done |
| 18 | Notes (blocks, links, search) | done |
| 19 | Export / import, Settings | done |
| 20 | a11y, perf, Playwright, deploy config | done |

## Decisions not to re-litigate

- **Layering** `routes → features → ui → domain → data → lib`, enforced by `import-x/no-restricted-paths` and proven by
  `scripts/lint-rules.test.ts`, which plants violations. `domain/` may import `data/types` only (row *types*, no Dexie), and may
  not read the clock.
- **Network confinement**: `fetch`/XHR only in `src/lib/ai/`; the Supabase SDK only in `src/lib/supabase.ts` (lazy-loaded, so
  non-cloud users never download it). Lint **and** `scripts/guards.mjs` (comment-stripped grep, catches aliasing); each guard has a
  test that plants a violation.
- **One clock reader**: `src/lib/clock.ts#readClock`. Local date from local getters, never a UTC string. Dates are
  `"YYYY-MM-DD"`, times `"HH:mm"`; date math is dayjs-in-UTC on the string's own fields (DST/timezone-proof). `today`/`date` are
  required parameters on every service that stamps a date.
- **One write path**: `data/rows.ts` (`putRow`/`patchRow`/`softDelete`) stamps the row *and* enqueues for sync in the same
  transaction. Multi-table writes are single transactions (`runTx`) so an interrupted write leaves nothing half-applied.
- **Recurrence is expanded at read time** by a pure function; annotations (`eventOccurrences`) can *place* a moved occurrence.
- **Honesty rules, encoded and tested**: behind-target is red, on-track uncoloured; the current week is judged pro-rata (Monday
  is never red) and future weeks get no verdict; AI-off % is `null` (shown “—”) with no learning blocks; sleep shows only days where
  fuel was *entered* (carried defaults are ghosts until you accept them); the review queue card is absent when empty; funnel counts
  are labelled a *census*, not a conversion funnel; burnout needs two consecutive explicit “no”s and `null` breaks the run.
- **Groq models pinned from the live docs (2026-10-05)**: `openai/gpt-oss-120b` primary, `llama-3.3-70b-versatile` fallback. They live
  server-side (`supabase/functions/ai/models.ts`); `GROQ_MODELS` overrides without a redeploy; `MODEL_RETIRED` is its own message.

## Deviations from the spec (and why)

1. **TypeScript 6.0.x, not 7**: `typescript-eslint` caps at `<6.1`. **React Router v7** (v8 exists).
2. **Write orchestration lives in `features/services/`**: `domain/` sits *above* `data/`, so repositories can't call domain derivations
   (block type, review schedule). Repos are dumb persistence taking fully-formed rows.
3. **The cloud mirror is one generic `sync_rows` jsonb table**, not ~22 typed tables: local-first means the cloud is a backup/second
   device, and one table means RLS is written and audited once. LWW is enforced inside `sync_push()` (newer `updatedAt` wins); the pull
   watermark is a server `seq`, not a timestamp (ties and clock skew).
4. **`weeklyTargets`/`weeklyReviews` use `id` as PK with a UNIQUE `weekNumber`** (uniform sync); `logBlocks` gains a denormalised `date`.
5. **A `portals` table** for the 12 job portals — they aren't dated, and “one events table” is about dated things.
6. **Seeds**: untouched seed rows are never queued for sync (reproducible from the bundle); an edit/delete sets `userModified` and queues.
   One-per-date rows (dailyLog, plannerDay, occurrence, review, setting) use deterministic ids so two devices converge.
7. **The Groq key has no input in Settings** (the spec asks for “Groq key” in Settings *and* “never in client code/localStorage/sync
   payload”): Settings shows server status + the `supabase secrets set` instructions instead; “Check AI” compares pinned models with
   what Groq serves.
8. **The pack validator lives in `lib/packSchema.ts`** so seeds, `lib/ai` and the importer share it; it also requires first = HOOK and
   last = SUMMARY. The Edge Function **rejects unknown request keys** (defence in depth against spreading a row) and rate-limits per user.
9. **AI output never drives writes or navigation**: chat is rendered by a constrained-markdown parser into React text nodes; a generated
   pack is saved only after validation, on an explicit button press.
10. **Accessibility changes**: `ink-3` (3.4:1) is not used for readable text, only icons/borders/placeholders; in light mode, text on a
    15% status tint uses darker `--danger-ink/--warning-ink/--success-ink`; the calendar is a group of labelled buttons, not a partial
    ARIA grid; a sheet moves focus in, traps Tab, and returns focus.
11. **Applying updates the log**: moving an application to APPLIED increments that day's `applicationsSent` in the same transaction (one
    write path, so the tracker and the log can't disagree). `aiOffRespected` is *derived*, not entered.
12. **Interpretations the spec left open**: DSA “done” counts every non-FAILED outcome; a streak is consecutive days with ≥ 1 logged block
    (counted back from yesterday if today is empty); the study-block times (06:30 / 19:00 / 21:00 / weekend) and the W1–W18 topic
    allocation are my defaults — edit them in the Calendar (an edited seed row is never overwritten).
13. **Opportunity dates are typical windows** (stated once, on screen) and links go to organisation root pages only — verify before
    relying on them.
14. **Tests and literal dates**: clock-dependent tests inject a fixed clock and derive expectations; literal dates appear only for
    seed-content assertions and fixed-clock fixtures.

## What was verified, and how

- **Domain** (≥ 99%): week math, recurrence, spaced repetition, state machine (all 49 pairs), burnout (tri-state), progress, planner geometry.
- **SQL**: the real migration runs on Postgres (PGlite) as two different users — RLS select/insert/update/delete, `with check`, `sync_push` LWW,
  anonymous denied — plus a planted-defect test proving the harness would catch missing RLS.
- **Sync**: two simulated devices, offline queue/replay, edits during an in-flight push, soft deletes, pagination, validation of remote rows.
- **AI**: every failure reason; payload-leak test against a fully-populated fixture (asserts no sensitive column names/values on the wire);
  Edge Function with a fake transport, including key-never-in-body/response/log.
- **Bugs the tests/e2e actually found and fixed**: fast taps losing a stepper update; async-clear races in subject/topic/note fields (typing
  right after Enter); concurrent settings read-modify-write; same-millisecond chat ordering; a half-written application when the page is left
  mid-write; chip-group inside a `<label>` mis-naming its first chip.

## Open issues / needs the owner

- **Not created from here** (they need your accounts): the Supabase project, the Edge Function secret, and the Vercel/Netlify project. The
  repo ships the migration, function, config and CI; `README.md` has the exact steps.
- **Never exercised against live Groq / live Supabase** (no keys in this environment). The function is verified with a fake transport and the
  pinned model list from Groq's live docs; the SQL on real Postgres; the worker on a fake remote with the same semantics. The magic-link
  sign-in flow is untested end to end.
- **Lighthouse numeric scores were not run**; installability is verified with the browser's own check (CDP), offline with e2e.
- **Not tested on real iOS Safari / Android devices** (installability, storage persistence, `dvh`, `inert`).
- The Progress route chunk is ~400 kB (Recharts), route-split so it only loads there; the main bundle is ~140 kB gzipped.
- Planner drag is pointer-based with `touch-action: none` on task blocks; a keyboard-only way to move a task is the edit sheet (not drag).
