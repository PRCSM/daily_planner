import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTodayBundle } from '@/data/repos/bundles'
import { setDeliverableDone } from '@/data/repos/plan'
import { addDays, formatDay, formatDuration, relativeDay, startOfWeek } from '@/domain/dates'
import { expandEvents, type Occurrence } from '@/domain/recurrence'
import { SECTIONS, deadlinePill, groupBySection, plannedMinutes, splitToday } from '@/domain/today'
import { dsaDoneTotal, dsaTargetTotal } from '@/domain/progress'
import { currentStreak } from '@/domain/streak'
import { weekFor } from '@/domain/weeks'
import { PHASE_LABEL, TRACK_LABEL } from '@/lib/enums'
import { Card, CardList, Note, Pill, Row, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Checkbox } from '@/ui/controls'
import { Icon } from '@/ui/Icon'
import { useUi } from '@/features/store'
import { useToday } from '@/features/useToday'
import { setOccurrenceDone } from '@/features/services/events'
import { WeekStrip } from './WeekStrip'
import { ReviewQueue } from './ReviewQueue'

export function TodayScreen() {
  const today = useToday()
  const selected = useUi((s) => s.selectedDate) ?? today
  const setSelected = useUi((s) => s.setSelectedDate)
  const openLog = useUi((s) => s.openLog)

  const weekStart = startOfWeek(selected)
  const from = weekStart
  const to = [addDays(weekStart, 6), addDays(today, 14)].sort().at(-1)!
  // ONE query for the whole screen (no N+1): a single Dexie transaction.
  const data = useLiveQuery(() => getTodayBundle(selected, from, to, today), [selected, from, to, today])

  const view = useMemo(() => {
    if (!data) return null
    const occ = expandEvents(data.events, data.annotations, from, to)
    const onDay = occ.filter((o) => o.date === selected)
    const { blocks, due } = splitToday(onDay)
    const week = weekFor(data.weeks, selected)
    const dueDeliverables = data.deliverables.filter((d) => d.dueDate === selected && !d.done)
    return {
      blocks: groupBySection(blocks),
      blockCount: blocks.length,
      due,
      dueDeliverables,
      week,
      done: dsaDoneTotal(data.problems),
      target: dsaTargetTotal(data.weeks),
      streak: currentStreak(new Set(data.activeDates), today),
      deadline: deadlinePill(data.events, today),
      logged: new Set(data.loggedDates),
      minutes: data.blocks.reduce((n, b) => n + b.minutes, 0),
      blocksLogged: data.blocks.length,
    }
  }, [data, selected, from, to, today])

  const isToday = selected === today
  const title = isToday ? 'today' : formatDay(selected, 'ddd D MMM').toLowerCase()

  return (
    <Screen>
      <ScreenTitle
        sub={
          view?.week
            ? `Week ${view.week.weekNumber} · ${PHASE_LABEL[view.week.phase]} · ${formatDay(selected)}`
            : formatDay(selected)
        }
        right={!isToday ? <button type="button" className="press t-label rounded-full bg-surface px-3 py-1.5" onClick={() => setSelected(null)}>Back to today</button> : null}
      >
        {title}
      </ScreenTitle>

      {/* Stat pills + the deadline pill */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="stat-pills">
        {view ? (
          <>
            <Pill tone="neutral" className="!px-3 !py-1.5 !text-[13px]">
              DSA {view.done}/{view.target}
            </Pill>
            <Pill tone="neutral" icon="flame" className="!px-3 !py-1.5 !text-[13px]">
              {view.streak}d streak
            </Pill>
            {view.deadline ? (
              <Pill tone="danger" icon="alert" className="!px-3 !py-1.5 !text-[13px]">
                {view.deadline.title} · {view.deadline.daysLeft === 0 ? 'today' : `${view.deadline.daysLeft}d`}
              </Pill>
            ) : null}
          </>
        ) : null}
      </div>

      <WeekStrip selected={selected} today={today} logged={view?.logged ?? new Set()} onSelect={setSelected} />

      {/* The 30-second box: log what actually happened */}
      <button
        type="button"
        className="press mt-4 flex w-full items-center gap-3 rounded-[14px] bg-surface p-4 text-left"
        onClick={() => openLog(selected)}
        data-testid="open-log"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised">
          <Icon name="edit" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-body-strong block">{view && view.blocksLogged > 0 ? `${formatDuration(view.minutes)} logged` : isToday ? 'Log today' : `Log ${formatDay(selected)}`}</span>
          <span className="t-label block text-ink-2">{view && view.blocksLogged > 0 ? `${view.blocksLogged} block${view.blocksLogged === 1 ? '' : 's'} · tap to add more` : 'what actually happened — about 30 seconds'}</span>
        </span>
        <Icon name="chevron-right" size={18} />
      </button>

      <div className="mt-6" />
      {/* Review queue: ABSENT when empty — never an empty state. */}
      {data ? <ReviewQueue items={data.reviewQueue} today={today} /> : null}

      {view && view.blockCount === 0 && view.due.length === 0 && view.dueDeliverables.length === 0 ? (
        <Card>
          <Note>Nothing planned for {isToday ? 'today' : relativeDay(selected, today)}. Use the + button to add something.</Note>
        </Card>
      ) : null}

      {view
        ? SECTIONS.map((section) =>
            view.blocks[section].length ? (
              <section key={section} aria-label={section}>
                <SectionLabel>{section}</SectionLabel>
                <CardList>
                  {view.blocks[section].map((o) => (
                    <BlockRow key={o.key} o={o} onOpenLog={() => openLog(selected, { track: o.event.track, minutes: plannedMinutes(o) ?? undefined })} />
                  ))}
                </CardList>
              </section>
            ) : null,
          )
        : null}

      {view && (view.due.length > 0 || view.dueDeliverables.length > 0) ? (
        <section aria-label="Due today">
          <SectionLabel>{isToday ? 'Due today' : `Due ${relativeDay(selected, today)}`}</SectionLabel>
          <CardList>
            {view.due.map((o) => (
              <Row
                key={o.key}
                leading={<Checkbox label={`Done: ${o.title}`} checked={o.done} onChange={(v) => void setOccurrenceDone(o, v)} />}
                prefix={`${o.title}${o.span?.isEnd && !o.span.isStart ? ' — closes' : o.span?.isStart ? ' — opens' : ''}`}
                right={o.event.criticality === 'HARD' ? <Pill tone={o.done ? 'neutral' : 'danger'}>HARD</Pill> : undefined}
                dim={o.done}
              />
            ))}
            {view.dueDeliverables.map((d) => (
              <Row key={d.id} leading={<Checkbox label={`Done: ${d.text}`} checked={d.done} onChange={(v) => void setDeliverableDone(d.id, v)} />} prefix="Deliverable:" right={<Pill>wk {d.weekNumber}</Pill>}>
                {d.text}
              </Row>
            ))}
          </CardList>
        </section>
      ) : null}
    </Screen>
  )
}

function BlockRow({ o, onOpenLog }: { o: Occurrence; onOpenLog: () => void }) {
  const mins = plannedMinutes(o)
  return (
    <div className={`flex items-center gap-3 rounded-[14px] bg-surface p-4 ${o.done ? 'opacity-60' : ''}`} data-testid="block-row">
      <Checkbox label={`Done: ${o.title}`} checked={o.done} onChange={(v) => void setOccurrenceDone(o, v)} />
      <button type="button" className="press t-body min-w-0 flex-1 text-left" onClick={onOpenLog} aria-label={`${o.title}: open log`}>
        <span className="t-body-strong">{o.title}:</span>{' '}
        <span className="text-ink-2">
          {o.startTime ? `${o.startTime} · ` : ''}
          {o.event.track ? TRACK_LABEL[o.event.track] : ''}
          {o.moved ? ' · moved' : ''}
        </span>
      </button>
      {mins ? <Pill>{formatDuration(mins)}</Pill> : null}
    </div>
  )
}
