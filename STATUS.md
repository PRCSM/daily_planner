# Cadence — STATUS

Offline-first PWA for an 18-week placement-prep plan. One unified `events` timeline viewed five ways.

## Build order progress

| # | Step | State |
|---|------|-------|
| 1 | Scaffold, TS strict, ESLint layer rules, PWA manifest + SW | done |

## Decisions not to re-litigate

- **Layering** `routes → features → ui → domain → data → lib`, enforced by `import-x/no-restricted-paths`
  (`eslint.config.js`) and proven by `scripts/lint-rules.test.ts`, which plants violations.
  `domain/` may import `data/types` only (row *types*, no Dexie).
- **Network confinement**: `fetch`/XHR only in `src/lib/ai/`; the Supabase SDK only in `src/lib/supabase.ts`.
  Lint + `scripts/guards.mjs` (comment-stripped grep, catches aliasing) — proven by `scripts/guards.test.ts`.
- **One clock reader**: `src/lib/clock.ts#readClock`. Local date built from local getters, never a UTC string.
- Dates are `"YYYY-MM-DD"` strings, times `"HH:mm"`; all date math via dayjs (UTC mode, so DST can never shift a day).
- Groq models pinned (from console.groq.com/docs/models, fetched at build time): primary `openai/gpt-oss-120b`,
  fallback `llama-3.3-70b-versatile`. Ids live server-side in the Edge Function so a deprecation is a function
  redeploy, not a client release.

## Deviations from the spec (and why)

1. **TypeScript 6.0.x, not 7**: `typescript-eslint` caps at `<6.1`. React Router pinned to **v7** (v8 exists).
2. _(more are appended as they arise)_

## Open issues

- A Supabase project / Vercel deploy needs the user's accounts; the repo ships the migration, Edge Function and CI
  but cannot create them from this environment.
