import type { Track } from '@/lib/enums'

/**
 * Chart colours. The UI is near-monochrome; colour appears in charts only where categories must be told apart
 * (tracks in the stacked minutes chart). Muted so they sit quietly on both warm backgrounds.
 */
export const TRACK_COLOR: Record<Track, string> = {
  DSA: '#6E8FB8',
  CORE_CS: '#7FA383',
  SYSTEM_DESIGN: '#9A86B5',
  OOP_LLD: '#C2A06A',
  GENAI: '#C27F8B',
  PROJECT: '#6FA8A8',
  APPLICATIONS: '#A0A09A',
  WRITING: '#8B8B86',
}

export const axisTick = { fill: 'var(--ink-2)', fontSize: 11 } as const
export const gridStroke = 'var(--hairline)'
export const tooltipStyle = {
  contentStyle: { background: 'var(--raised)', border: '1px solid var(--hairline)', borderRadius: 10, color: 'var(--ink)', fontSize: 12 },
  labelStyle: { color: 'var(--ink-2)' },
  itemStyle: { color: 'var(--ink)' },
  cursor: { fill: 'var(--surface)' },
} as const
