# Cadence

An offline-first PWA for an 18-week placement-prep plan. One user opens it every morning and sees what today is — what to
study, what's due, which deadline is close — plus a 30-second box to log what actually happened.

The plan, the opportunity calendar, the application tracker and the daily planner are **one timeline of dated
obligations** (a single `events` store) viewed five ways. See [`STATUS.md`](./STATUS.md) for what's built, the decisions
not to re-litigate, and open issues.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — fully usable with no account and no network
npm run ci           # typecheck + lint + guards + unit/integration tests + build
npm run e2e          # Playwright (production build, service worker, offline reload) — see below
```

The app seeds itself on first launch (18 weekly targets, ~45 opportunities, 12 portals, 12 lesson packs, 31 quotes, plus the
Capgemini exam-prep collection below). The 18-week plan starts **Mon 5 Oct 2026** (first scheduled day Wed 7 Oct) and ends Sun 7 Feb 2027.

## Capgemini exam prep

A 60-day exam-prep track runs alongside the base plan (it does not replace it): one evening block per day (17:30–19:00 weekdays,
15:00–17:00 weekends) next to the existing Deep A / Deep B / Block C rhythm. **Learn → Capgemini prep** shows today's day, the days to the exam
and that day's packs. The content — 62 lessons, 64 drill packs (423 exam-style MCQs, answer revealed on tap), 22 coding problems, 22 debugging
challenges, interview flashcards, prompt-engineering and AI-assisted-coding walk-throughs, English drills — was converted from a standalone prep
page by `scripts/extract-capgemini.mjs` into `src/seed/capgemini/content.json` (loaded lazily, only when the seed runs).

```bash
node scripts/extract-capgemini.mjs path/to/capgemini-2027-prep.html   # deterministic; commit the diff
```

The exam date in Calendar (**7 Dec 2026**) is a **placeholder** — replace it with the date on your invitation.
No account, no network. Everything below is **optional**.

## Cloud sync (optional)

Local-first: every write goes to IndexedDB immediately; a background worker mirrors changes to Supabase when online.

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (one RLS-protected `sync_rows` table + `sync_push()`).
2. Authentication → enable **Email** (magic link) and add your site URL to the redirect list.
3. Copy `.env.example` → `.env.local` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (the anon key is public by design; RLS protects rows).
4. Open **More → Settings → Sync** and request a sign-in link.

## AI (optional, Learn tab only)

Two modes, one code path (the browser runs the same handler the Edge Function runs):

- **Direct** (personal use): build with `VITE_GROQ_API_KEY` set (host env var or `.env.local` — never in source or git). The site calls Groq itself; no
  sign-in or Supabase needed. The key is compiled into the site's JavaScript, so anyone who reads the bundle can use it: use a **free, rotatable** key only.
- **Cloud** (default when that variable is unset): the key is **never** in the app. It lives as a server-side secret in a Supabase Edge Function:

```bash
supabase secrets set GROQ_API_KEY=...         # the only place the key exists
supabase functions deploy ai                  # verify_jwt is on: only signed-in users can spend your quota
supabase secrets set GROQ_MODELS=a,b          # optional: override pinned model ids without a redeploy
```

Model ids are pinned in `supabase/functions/ai/models.ts` (from the Groq docs). Groq retires models on a ~2-month
cycle; **Settings → Check AI** compares them with what Groq currently serves, and a retired model surfaces as its own
`MODEL_RETIRED` message rather than a generic server error.

## Deploy

`vercel.json` / `netlify.toml` are included (SPA rewrite, immutable asset caching, `no-cache` for the service worker, and
a strict CSP with no inline scripts). Build command `npm run build`, output `dist/`. GitHub Actions
(`.github/workflows/ci.yml`) runs typecheck + lint + guards + tests + build on every push, then Playwright.

## Architecture

```
routes/ → features/ → ui/ → domain/ → data/ → lib/        (one direction; enforced by ESLint)
```

| Layer | What lives there | Rules |
|---|---|---|
| `lib/` | clock, ids, enums, pack validator, **`lib/ai` (the only `fetch`)**, `lib/supabase.ts` (the only SDK import) | leaf |
| `data/` | Dexie schema, the single write path (`rows.ts`), repositories, seed loader, sync worker, backup | no components touch Dexie |
| `domain/` | pure logic: weeks, recurrence, spaced repetition, state machines, burnout, progress, planner geometry | no React, no Dexie, no network, **no clock** |
| `ui/` | design tokens, spring motion, primitives, sheet, nav | |
| `features/` | screens + `services/` (write orchestration: domain decides, data persists) | |
| `routes/` | thin lazy route modules | |

Guards that fail the build: `npm run lint` (layer rules, network/clock bans), `npm run guards`
(comment-stripped grep that also catches aliased imports — each guard has a test that **plants a violation**).

## Testing, on purpose asymmetric

`domain/` ≥ 95% · repositories against real Dexie (fake-indexeddb) · `lib/ai` every failure path + a payload-leak test ·
sync worker with two simulated devices · the SQL itself runs on real Postgres (PGlite) to prove the RLS policies ·
components: critical interactions only · e2e: 5 flows + axe on every screen.

```bash
npm test               # everything except e2e
npm run coverage       # with per-layer thresholds
```

### e2e locally

Playwright needs Chromium. In CI: `npx playwright install --with-deps chromium`. If a browser is already on the machine:
`PW_CHROMIUM=/path/to/chrome npm run e2e`.
