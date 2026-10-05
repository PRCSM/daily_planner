import { describe, expect, it } from 'vitest'
import { MOTION, settleTime, springCss, springPosition } from './motion'

describe('spring motion', () => {
  it('starts at 0 and settles at 1', () => {
    for (const spec of Object.values(MOTION)) {
      expect(springPosition(spec, 0)).toBe(0)
      expect(springPosition(spec, 5)).toBeCloseTo(1, 4)
    }
  })
  it('critically damped never overshoots; under-damped does', () => {
    let max = 0
    for (let t = 0; t < 1; t += 0.002) max = Math.max(max, springPosition(MOTION.press, t))
    expect(max).toBeLessThanOrEqual(1.0001)
    let maxBouncy = 0
    for (let t = 0; t < 1; t += 0.002) maxBouncy = Math.max(maxBouncy, springPosition(MOTION.checkbox, t))
    expect(maxBouncy).toBeGreaterThan(1.005)
  })
  it('emits a CSS linear() easing ending exactly at 1', () => {
    const { easing, ms } = springCss(MOTION.sheet)
    expect(easing).toMatch(/^linear\(0, .*, 1\)$/)
    expect(ms).toBe(Math.round(settleTime(MOTION.sheet)))
  })
})
