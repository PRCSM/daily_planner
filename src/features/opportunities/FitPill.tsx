import type { FitPill as Fit } from '@/lib/enums'
import { Pill } from '@/ui/primitives'

/**
 * Fit pills carry judgement, not alarm — so they stay monochrome. Weight, not colour:
 * APPLY is the strongest (filled), then GOOD, MAYBE (outline), LONGSHOT (outline, quieter), CLOSED (dim).
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
      return <Pill tone="outline" className="opacity-70">LONGSHOT</Pill>
    case 'CLOSED':
      return <Pill tone="outline" className="opacity-60">CLOSED</Pill>
  }
}
