import { ApplicationSheet } from '@/features/applications/ApplicationSheet'
import { EventSheet } from '@/features/calendar/EventSheet'

/** Sheets reachable from the FAB on any screen — pre-mounted so they open instantly. */
export function GlobalSheets() {
  return (
    <>
      <EventSheet />
      <ApplicationSheet />
    </>
  )
}
