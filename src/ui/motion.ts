/**
 * Motion is specified as { duration, dampingRatio } — never stiffness/damping.
 *
 * `duration` is the spring's perceptual period (SwiftUI-style "response"):
 * ω = 2π / duration. `dampingRatio` ζ: 1 = critically damped (crisp, no overshoot),
 * <1 = a little bounce. We solve the damped-oscillator step response and hand the
 * browser a CSS `linear()` easing, so the spring runs on the compositor with no JS.
 *
 * NEVER animate: numbers counting up, bars filling on mount, anything celebratory.
 */
export interface SpringSpec {
  /** ms */
  duration: number
  dampingRatio: number
}

export const MOTION = {
  slide: { duration: 280, dampingRatio: 0.95 }, // slides, tab pill
  sheet: { duration: 350, dampingRatio: 0.88 },
  checkbox: { duration: 260, dampingRatio: 0.8 }, // tactile
  press: { duration: 140, dampingRatio: 1.0 }, // crisp
} as const satisfies Record<string, SpringSpec>

/** Unit step response of a damped spring at time t (seconds). */
export function springPosition(spec: SpringSpec, t: number): number {
  const w = (2 * Math.PI) / (spec.duration / 1000)
  const z = spec.dampingRatio
  if (t <= 0) return 0
  if (z >= 1) {
    // critically (or over) damped — use the critical form; ζ>1 is treated as critical for UI purposes
    return 1 - Math.exp(-w * t) * (1 + w * t)
  }
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
}

/** Time (ms) after which the spring is within 0.5% of rest. */
export function settleTime(spec: SpringSpec): number {
  const stepMs = 4
  let last = 0
  for (let ms = stepMs; ms <= 4000; ms += stepMs) {
    if (Math.abs(1 - springPosition(spec, ms / 1000)) > 0.005) last = ms
  }
  return Math.max(last + stepMs, spec.duration * 0.6)
}

const cache = new Map<string, { easing: string; ms: number }>()

/** CSS `linear()` easing + total duration for a spring. */
export function springCss(spec: SpringSpec): { easing: string; ms: number } {
  const key = `${spec.duration}/${spec.dampingRatio}`
  const hit = cache.get(key)
  if (hit) return hit
  const ms = Math.round(settleTime(spec))
  const samples = 36
  const pts: string[] = []
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : springPosition(spec, (ms * i) / samples / 1000)
    pts.push((Math.round(v * 1000) / 1000).toString())
  }
  const out = { easing: `linear(${pts.join(', ')})`, ms }
  cache.set(key, out)
  return out
}

/** Write the motion tokens onto :root so CSS can use var(--ease-sheet) / var(--dur-sheet). */
export function applyMotionTokens(root: HTMLElement = document.documentElement): void {
  const cssName = { slide: 'slide', sheet: 'sheet', checkbox: 'check', press: 'press' } as const
  for (const [name, spec] of Object.entries(MOTION) as [keyof typeof MOTION, SpringSpec][]) {
    const { easing, ms } = springCss(spec)
    root.style.setProperty(`--ease-${cssName[name]}`, easing)
    root.style.setProperty(`--dur-${cssName[name]}`, `${ms}ms`)
  }
}
