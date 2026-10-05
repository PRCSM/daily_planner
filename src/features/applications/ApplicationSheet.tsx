import { useEffect, useState } from 'react'
import { getApplication, removeApplication, updateApplication } from '@/data/repos/applications'
import { Sheet } from '@/ui/Sheet'
import { Button, Note } from '@/ui/primitives'
import { ChipGroup, Field, FieldGroup, TextArea, TextField } from '@/ui/controls'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { createApplication, setFollowUp } from '@/features/services/applications'
import { isValidDate } from '@/domain/dates'
import { APPLICATION_TYPES, type ApplicationType } from '@/lib/enums'

export interface ApplicationSheetPayload {
  id?: string
  company?: string
  role?: string
  url?: string
  source?: string
}
const TYPE_LABEL: Record<ApplicationType, string> = { FULL_TIME: 'Full-time', INTERNSHIP: 'Internship', CAMPUS: 'Campus', OSS: 'Open source', OTHER: 'Other' }

export function ApplicationSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.closeSheet)
  const open = sheet.name === 'application'
  const payload = (sheet.payload ?? {}) as ApplicationSheetPayload
  const today = useToday()
  const editing = payload.id

  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [type, setType] = useState<ApplicationType>('FULL_TIME')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [resume, setResume] = useState('')
  const [notes, setNotes] = useState('')
  const [applied, setApplied] = useState(false)
  const [followUp, setFollowUpDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (payload.id) {
      void getApplication(payload.id).then((a) => {
        if (!a) return
        setCompany(a.company)
        setRole(a.role)
        setType(a.type)
        setUrl(a.url ?? '')
        setSource(a.source ?? '')
        setResume(a.resumeVariant ?? '')
        setNotes(a.notes ?? '')
        setFollowUpDate(a.nextFollowUp ?? '')
      })
    } else {
      setCompany(payload.company ?? '')
      setRole(payload.role ?? '')
      setType('FULL_TIME')
      setUrl(payload.url ?? '')
      setSource(payload.source ?? '')
      setResume('')
      setNotes('')
      setApplied(false)
      setFollowUpDate('')
    }
  }, [open, payload.id, payload.company, payload.role, payload.url, payload.source])

  async function save() {
    if (!company.trim() || !role.trim()) return setError('Company and role are required.')
    let cleanUrl: string | undefined
    if (url.trim()) {
      try {
        const u = new URL(url.trim())
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('scheme')
        cleanUrl = u.toString()
      } catch {
        return setError('That link doesn’t look like a web address (https://…).')
      }
    }
    if (editing) {
      if (followUp && !isValidDate(followUp)) return setError('Pick a valid follow-up date.')
      await updateApplication(editing, { company: company.trim(), role: role.trim(), type, url: cleanUrl, source: source.trim() || undefined, resumeVariant: resume.trim() || undefined, notes: notes.trim() || undefined })
      await setFollowUp(editing, followUp || undefined)
    } else {
      await createApplication({ company, role, type, url: cleanUrl, source: source.trim() || undefined, resumeVariant: resume.trim() || undefined, notes: notes.trim() || undefined, startStatus: applied ? 'APPLIED' : 'SAVED' }, today)
    }
    close()
  }

  return (
    <Sheet open={open} onClose={close} title={editing ? 'Edit application' : 'Save application'} testId="application-sheet">
      <div className="flex flex-col gap-4">
        <Field label="Company">
          <TextField value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme" />
        </Field>
        <Field label="Role">
          <TextField value={role} onChange={(e) => setRole(e.target.value)} placeholder="SDE-1" />
        </Field>
        <FieldGroup label="Type">
          <ChipGroup label="Type" options={APPLICATION_TYPES} value={type} onChange={setType} render={(t) => TYPE_LABEL[t]} />
        </FieldGroup>
        <Field label="Link">
          <TextField value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Found via">
            <TextField value={source} onChange={(e) => setSource(e.target.value)} placeholder="Wellfound" />
          </Field>
          <Field label="Résumé variant">
            <TextField value={resume} onChange={(e) => setResume(e.target.value)} placeholder="backend-v2" />
          </Field>
        </div>
        {editing ? (
          <Field label="Next follow-up">
            <TextField type="date" value={followUp} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        ) : (
          <FieldGroup label="Already sent?">
            <ChipGroup label="Already sent?" options={['no', 'yes'] as const} value={applied ? 'yes' : 'no'} onChange={(v) => setApplied(v === 'yes')} render={(v) => (v === 'yes' ? 'Yes — I applied' : 'Not yet')} />
          </FieldGroup>
        )}
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="referral, recruiter, deadline…" />
        </Field>
        {!editing && applied ? <Note>Marking it applied schedules a follow-up in a week and counts toward today’s applications.</Note> : null}
        {error ? <p role="alert" className="t-label text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void save()}>
            {editing ? 'Save' : 'Add application'}
          </Button>
          {editing ? (
            <Button variant="danger" icon="trash" aria-label="Delete application" onClick={async () => (await removeApplication(editing), close())} />
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}
