import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { allNoteBlocks, allNotes, createNote } from '@/data/repos/notes'
import { listEvents } from '@/data/repos/events'
import { allApplications } from '@/data/repos/applications'
import { linkLabel, searchNotes } from '@/domain/notes'
import { formatDay } from '@/domain/dates'
import { IconButton, Note, Pill, Screen, ScreenTitle } from '@/ui/primitives'
import { TextField } from '@/ui/controls'
import { Icon } from '@/ui/Icon'

export function NotesScreen() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const notes = useLiveQuery(allNotes, [], [])
  const blocks = useLiveQuery(allNoteBlocks, [], [])
  const events = useLiveQuery(listEvents, [], [])
  const apps = useLiveQuery(allApplications, [], [])
  const hits = useMemo(() => searchNotes(notes, blocks, q), [notes, blocks, q])
  const resolve = useMemo(
    () => ({ event: (id: string) => events.find((e) => e.id === id)?.title, application: (id: string) => apps.find((a) => a.id === id)?.company }),
    [events, apps],
  )

  return (
    <Screen>
      <ScreenTitle right={<IconButton icon="plus" label="New note" className="bg-surface" onClick={async () => nav(`/notes/${(await createNote('')).id}`)} />}>notes</ScreenTitle>
      <div className="relative mb-4">
        <Icon name="search" size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <TextField type="search" aria-label="Search notes" placeholder="Search titles and text" value={q} onChange={(e) => setQ(e.target.value)} className="!pl-10" />
      </div>
      {hits.length === 0 ? <Note>{q ? `No notes match “${q}”.` : 'No notes yet. Tap + to write one — link it to a week, a day, an event or an application.'}</Note> : null}
      <ul className="flex flex-col gap-2" aria-label="Notes">
        {hits.map(({ note, snippet }) => {
          const link = linkLabel(note, resolve)
          return (
            <li key={note.id}>
              <Link to={`/notes/${note.id}`} className="press block rounded-[14px] bg-surface p-4" data-testid="note-row">
                <div className="flex items-start justify-between gap-3">
                  <span className="t-body-strong min-w-0 flex-1 truncate">{note.title || 'Untitled'}</span>
                  {link ? <Pill tone="outline">{note.linkType === 'DAY' && note.linkId ? formatDay(note.linkId, 'D MMM') : link}</Pill> : null}
                </div>
                {snippet ? <p className="t-label mt-1 line-clamp-2 text-ink-2">{snippet}</p> : null}
                <p className="t-meta mt-2 text-ink-3">{formatDay(note.updatedAt.slice(0, 10), 'D MMM')}</p>
              </Link>
            </li>
          )
        })}
      </ul>
    </Screen>
  )
}
