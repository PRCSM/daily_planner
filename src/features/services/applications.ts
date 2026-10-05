import { addApplication, getApplication, updateApplication } from '@/data/repos/applications'
import { createEvent, removeEvent, setEventDone, updateEvent } from '@/data/repos/events'
import { getLog } from '@/data/repos/logs'
import type { ApplicationRow } from '@/data/types'
import type { ApplicationStatus, ApplicationType } from '@/lib/enums'
import { defaultFollowUp } from '@/domain/applications'
import { transition } from '@/domain/applicationsFsm'
import { patchDay } from './logging'

export interface NewApplicationInput {
  company: string
  role: string
  type: ApplicationType
  url?: string
  source?: string
  resumeVariant?: string
  notes?: string
  /** A new application starts SAVED, or APPLIED if you already sent it. Both are legal entry states. */
  startStatus: Extract<ApplicationStatus, 'SAVED' | 'APPLIED'>
}

const followUpTitle = (a: Pick<ApplicationRow, 'company' | 'role'>) => `Follow up: ${a.company} — ${a.role}`

async function scheduleFollowUp(app: ApplicationRow, date: string): Promise<string> {
  if (app.followUpEventId) {
    await updateEvent(app.followUpEventId, { date, done: false, deletedAt: null })
    return app.followUpEventId
  }
  const ev = await createEvent({ title: followUpTitle(app), type: 'APPLICATION_TASK', date, criticality: 'SOFT', recurrence: 'NONE', sourceModule: 'APPLICATION', linkUrl: app.url })
  return ev.id
}

/** Applying counts toward today's "applications sent" — one write path, so the log and the tracker can't disagree. */
async function bumpSent(today: string): Promise<void> {
  const cur = (await getLog(today))?.applicationsSent ?? 0
  await patchDay(today, { applicationsSent: cur + 1 })
}

export async function createApplication(input: NewApplicationInput, today: string): Promise<ApplicationRow> {
  const { startStatus, ...rest } = input
  const base = await addApplication({ ...rest, company: input.company.trim(), role: input.role.trim(), status: startStatus })
  if (startStatus !== 'APPLIED') return base
  const followUp = defaultFollowUp(today)
  const eventId = await scheduleFollowUp(base, followUp)
  await bumpSent(today)
  return updateApplication(base.id, { appliedDate: today, nextFollowUp: followUp, followUpEventId: eventId })
}

export type AdvanceResult = { ok: true; app: ApplicationRow } | { ok: false; reason: string }

/** Move to the next state. Rejected unless the state machine allows it — and the UI only ever offers legal moves. */
export async function advanceApplication(id: string, to: ApplicationStatus, today: string): Promise<AdvanceResult> {
  const app = await getApplication(id)
  if (!app) return { ok: false, reason: 'Application not found' }
  const t = transition(app.status, to)
  if (!t.ok) return { ok: false, reason: t.reason }

  const patch: Partial<ApplicationRow> = { status: to }
  if (to === 'APPLIED') {
    patch.appliedDate = today
    patch.nextFollowUp = defaultFollowUp(today)
    patch.followUpEventId = await scheduleFollowUp(app, patch.nextFollowUp)
    await bumpSent(today)
  } else if (to === 'OA' || to === 'INTERVIEW') {
    patch.nextFollowUp = defaultFollowUp(today) // a new stage restarts the follow-up clock
    patch.followUpEventId = await scheduleFollowUp(app, patch.nextFollowUp)
  } else if (to === 'REJECTED' || to === 'OFFER' || to === 'GHOSTED') {
    patch.nextFollowUp = undefined
    if (app.followUpEventId) await setEventDone(app.followUpEventId, true)
  }
  return { ok: true, app: await updateApplication(id, patch) }
}

export async function setFollowUp(id: string, date: string | undefined): Promise<void> {
  const app = await getApplication(id)
  if (!app) return
  if (!date) {
    if (app.followUpEventId) await removeEvent(app.followUpEventId)
    await updateApplication(id, { nextFollowUp: undefined, followUpEventId: undefined })
    return
  }
  const eventId = await scheduleFollowUp(app, date)
  await updateApplication(id, { nextFollowUp: date, followUpEventId: eventId })
}
