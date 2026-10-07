import type { FitPill as Fit } from '@/lib/enums'
import { Pill } from '@/ui/primitives'

/**
 * Fit pills carry judgement, not alarm — so they stay monochrome. Weight, not colour:
 * APPLY is the strongest (filled), then GOOD, MAYBE (outline), LONGSHOT (outline, quieter), CLOSED (outline, the row itself muted).
 */
export function FitPill({ fit }: { fit: Fit }) {
  switch (fit) {
    case 'APPLY':
      return <Pill className="!bg-ink !text-bg">APPLY</Pill>
    case 'GOOD':
      return <Pill tone="neutral" className="!text-ink">GOOD</Pill>
    case 'MAYBE':
      return <Pill tone="outline">MAYBE</Pill>
    case 'LONGSHOT':
      return <Pill tone="outline" className="italic">LONGSHOT</Pill>
    case 'CLOSED':
      // Quiet by being outline-only, never by opacity: faded text fails contrast (WCAG 1.4.3).
      return <Pill tone="outline">CLOSED</Pill>
  }
}
