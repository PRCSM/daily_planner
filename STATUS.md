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

## Deployment (2026-10-06)

- **Supabase** project `Cadence` (`tuaadqinqhiwksuuwtfa`, ap-southeast-1): `sync_rows` + RLS (forced, 4 owner-only policies) + `sync_push` / `sync_wipe`
  applied and checked (anon has no table or function access). Edge Function `ai` deployed with `verify_jwt = true`.
  The migration was applied in four parts because one large `apply_migration` call timed out at the MCP layer.
- **Edge Function imports now carry `.ts` extensions** (Deno requires them; `allowImportingTsExtensions` was already on).
- **`GROQ_API_KEY` is NOT set yet**: the Supabase MCP has no secrets tool. Set it with `supabase secrets set GROQ_API_KEY=…` or in the
  dashboard (Edge Functions → Secrets). Until then the function answers `NO_KEY` and Learn → chat says AI is not configured.
- **Vercel** project `cadence` linked to this repo; `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set (public values by design).

## Re-based plan + Capgemini exam prep (2026-10-07)

- **Plan re-based to start from today.** Every plan date moved exactly 12 weeks later: week 1 = Mon 5 Oct 2026 … week 18 = Sun 7 Feb 2027; the
  daily blocks start Wed 7 Oct (week 1 is a short week, and the pro-rata verdict means a short week is never red). Milestone and deliverable
  dates are now *derived* from week numbers (`weekStart`/`weekEnd`), not typed as literals. `SEED_VERSION` 2 → 3: a re-seed refreshes untouched
  rows in place (deterministic ids) and never overwrites an edited one. Dated *opportunity windows* are real-world calendar facts and did not move.
- **Capgemini prep is a second track beside the base plan, not a replacement.** 60 one-off day blocks (Day 1 = Wed 7 Oct … Day 60 = Sat 5 Dec) in
  their own evening/weekend slot, so the base rhythm (06:30 Deep A, 19:00 Deep B, 21:00 Block C, weekend build) is untouched. Each day block's
  notes list that day's lessons, drills and practice; the same day's packs are tagged `cg-d<N>` and surface in **Learn → Capgemini prep**.
- **Conversion, not a port.** `scripts/extract-capgemini.mjs` evaluates the page's data arrays in an empty `vm` context, rewrites lesson HTML to the
  app's constrained markdown (tables → labelled bullets, callout boxes → WARNING/EXAMPLE/CONCEPT cards, code kept as fenced blocks), and asserts
  every rewrite. Output is deterministic and validated by the same `validatePackObject` as AI-generated packs. 207 packs / 1,306 cards / 60 days.
- **Loaded lazily** (`import('./content.json?raw')` → its own ~132 kB-gzip chunk, fetched only when the seed runs). If that fetch fails the seed
  **defers entirely** (writes nothing, keeps the old version, retries next launch) so a partial seed can never delete the already-seeded packs.
- **Exam-pack separation**: Capgemini packs carry the tag `capgemini` and are excluded from the generic "today's pack" picker; the Library defaults
  to *Core plan* with *Capgemini* (+ kind chips) and *All* scopes.
- **Fixed on the way (found by e2e once the clock moved to a date with closed opportunities):** `text-on-accent` never generated CSS (no
  `--color-on-accent` in `@theme`), so the add button, accent pills and the calendar's *today* marker used inherited light text on coral (2.55:1);
  closed opportunities were dimmed with `opacity-50`, which fails contrast (1.6–4.4:1) — they are now muted by colour and the outline pill.

### Deviations / honest limits of the Capgemini import

1. **The exam date is a placeholder.** 7 Dec 2026 came from the source page's own default (60 days from its start), not from an invitation. It is a
   HARD milestone titled "confirm this date"; the Learn card says so until the event is edited. Editing it does not re-time the 60 day blocks.
2. **Interactive mechanics were not ported:** timed section tests and full mocks, per-question scoring and topic accuracy, the cognitive games
   (grid / motion / switch / digit / series / deduction), speech recognition and dictation scoring. Drills are *reveal-the-answer* cards (self-scored);
   plan days that name a game or a mock say so ("not in this app" / "as one timed sitting") instead of pretending. The original page still has them.
3. **Lessons are mechanically converted** (headings → cards, plus a derived "to remember" recap). Spot-checked and asserted structurally, not
   re-written by hand — read a few on your device and say if any card reads badly.
4. **Source provenance**: the 2027 pattern is candidate-reported (Capgemini has not published it). The pack "Capgemini 2027 · the exam at a glance"
   keeps that caveat verbatim.
5. **Load**: the prep block is ~1.5 h on weekdays, 2 h on weekends, on top of ~5 h of base-plan blocks. The source's own daily menu is longer than that;
   anything that does not fit is marked optional in practice, not silently dropped. Move the blocks in Calendar if your college hours differ.
6. **Application timing tension (not changed):** the base plan's application ramp (weeks 3–5 onwards) was written for a mid-July start, while several
   real hiring windows (Google, Adobe, Atlassian, campus season) open in early/mid October. Starting from scratch today means those windows overlap
   your first weeks. The weekly application targets are untouched — edit them in Plan if you want them earlier.

## Direct AI mode (2026-10-07) — a deliberate, owner-requested deviation from "the key never reaches the browser"

- **Decision (the owner's, for a personal app and a free key):** the site may call Groq straight from the browser. `VITE_GROQ_API_KEY`, set as a
  *sensitive* Vercel build variable (production + preview), switches `lib/ai` to **direct mode**; with it unset the app behaves exactly as before (cloud mode:
  Supabase Edge Function, key server-side only). The key is **not in source or git** — only in the host's build environment and, necessarily, in the shipped
  JavaScript, so **anyone who reads the bundle can use it**. Treat it as disposable: rotate it at console.groq.com if it ever leaks or is abused.
- **One code path, not two:** direct mode runs the Edge Function's own `run()` (strict unknown-key-rejecting validation, prompts, model fallback on retirement
  only, per-user rate limit) in the browser via an injected `fetch`; `lib/ai` is still the only module that calls `fetch`. No sign-in and no Supabase needed.
- **Guards kept:** the secrets guard and export check still hold (the key is in no source file, storage, backup or sync payload — tested by "the key never
  appears in anything returned to the app"). CSP `connect-src` now also allows `https://api.groq.com`. Settings states which mode is active, and the cost.
- **A real bug found by the new integration-style tests:** the Edge Function answers chat with `data.content`, but the chat client read `data.reply` — chat
  through the cloud function could never have worked (every earlier test faked the server with `reply`). Fixed on the client; the fakes now match the real shape.
- The deployed Edge Function was not redeployed: the repo copy only gained an exported `run()` split and a realm-safe `AbortError` check (no behaviour change).

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
