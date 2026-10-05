// Supabase Edge Function entrypoint (Deno). All logic lives in handler.ts so it can be tested under Node.
//
//   supabase secrets set GROQ_API_KEY=...            # the ONLY place the key lives
//   supabase secrets set GROQ_MODELS=a,b             # optional: override pinned models without a redeploy
//   supabase functions deploy ai                     # verify_jwt is ON (see supabase/config.toml)
import { handle } from './handler.ts'

Deno.serve((req) =>
  handle(req, {
    env: { GROQ_API_KEY: Deno.env.get('GROQ_API_KEY'), GROQ_MODELS: Deno.env.get('GROQ_MODELS'), ALLOWED_ORIGIN: Deno.env.get('ALLOWED_ORIGIN') },
    fetchImpl: fetch,
    now: () => Date.now(),
  }),
)
