/**
 * Pinned Groq model ids. Names deprecate on a ~2-month cycle, so they live HERE (server side) rather than in the
 * client: a retirement is a function redeploy — or just `supabase secrets set GROQ_MODELS=a,b` with no redeploy.
 *
 * Pinned from https://console.groq.com/docs/models (production tier) on 2026-10-05.
 * `checkAi()` / Settings → diagnostics compares these against GET /openai/v1/models so a retirement is visible
 * BEFORE a user hits MODEL_RETIRED.
 */
export const DEFAULT_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'] as const
export const GROQ_BASE = 'https://api.groq.com/openai/v1'

export function modelsFrom(env: { GROQ_MODELS?: string }): string[] {
  const fromEnv = (env.GROQ_MODELS ?? '').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9._/-]{3,80}$/.test(s))
  return fromEnv.length ? fromEnv : [...DEFAULT_MODELS]
}
