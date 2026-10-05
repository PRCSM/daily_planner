import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { startOfWeek } from '@/domain/dates'
import { heatmap } from '@/domain/streak'
import { TRACKS, TRACK_LABEL } from '@/lib/enums'
import { Card, NotEnoughData, Pill, Screen, ScreenTitle, SectionLabel } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { TRACK_COLOR, axisTick, gridStroke, tooltipStyle } from '@/ui/chart'
import { useToday } from '@/features/useToday'
import { formatDay } from '@/domain/dates'
import { useProgress } from './useProgress'

const HEAT_WEEKS = 20

export function ProgressScreen() {
  const today = useToday()
  const p = useProgress(today)
  if (!p) return <Screen>{null}</Screen>

  const heat = heatmap(p.minutesByDate, today, HEAT_WEEKS, startOfWeek)
  const burn = p.burnUp.map((b) => ({ week: `W${b.week}`, target: b.target, actual: b.actual }))
  const minutes = p.minutes.map((m) => ({ week: `W${m.week}`, ...Object.fromEntries(TRACKS.map((t) => [t, Math.round((m.byTrack[t] / 60) * 10) / 10])) }))
  const apps = p.apps.map((a) => ({ week: `W${a.week}`, sent: a.sent, target: a.target }))
  const anyMinutes = p.minutes.some((m) => m.total > 0)

  return (
    <Screen>
      <ScreenTitle sub={`${p.done} of ${p.target} DSA problems`}>progress</ScreenTitle>

      {/* AI-OFF integrity */}
      <SectionLabel>AI-off integrity</SectionLabel>
      <Card data-testid="ai-off-meter">
        <div className="t-title tabular-nums">{p.aiPctWeek === null ? '—' : `${p.aiPctWeek}%`}</div>
        <p className="t-label mt-1 text-ink-2">
          {p.aiPctWeek === null ? 'No learning blocks logged this week yet — nothing to measure.' : 'of learning blocks were AI-free this week'}
        </p>
        <p className="t-meta mt-1 text-ink-2">
          Learning = DSA, core CS, system design, OOP/LLD. AI is for shipping.{p.aiPctAll === null ? '' : ` All-time: ${p.aiPctAll}%.`}
        </p>
        {p.aiFlagged.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5" aria-label="Learning blocks that used AI this week">
            {p.aiFlagged.map((b) => (
              <li key={b.id} className="t-label flex items-center justify-between gap-2 rounded-[10px] bg-raised px-3 py-2">
                <span className="truncate">{formatDay(b.date, 'ddd D MMM')} · {TRACK_LABEL[b.track]}{b.topic ? ` · ${b.topic}` : ''}</span>
                <Pill tone="warning">AI used</Pill>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* Burn-up */}
      <SectionLabel right={<Link to="/progress/dsa" className="t-label flex items-center gap-1 text-ink-2">Patterns <Icon name="chevron-right" size={14} /></Link>}>DSA burn-up</SectionLabel>
      <Card>
        <div className="h-52" role="img" aria-label="DSA problems done versus cumulative target, by week">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={burn} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="target" name="Target" stroke="var(--ink-3)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="actual" name="Done" stroke="var(--ink)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="t-meta mt-2 text-ink-2">Target is the sum of the 18 weekly targets. The “done” line stops at today — future weeks are never filled in.</p>
      </Card>

      {/* Minutes by track */}
      <SectionLabel>Hours by track</SectionLabel>
      <Card>
        {anyMinutes ? (
          <div className="h-56" role="img" aria-label="Hours per week, stacked by track">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={minutes} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {TRACKS.map((t) => (
                  <Bar key={t} dataKey={t} name={TRACK_LABEL[t]} stackId="h" fill={TRACK_COLOR[t]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NotEnoughData>No blocks logged yet.</NotEnoughData>
        )}
      </Card>

      {/* Applications */}
      <SectionLabel>Applications per week</SectionLabel>
      <Card>
        <div className="h-44" role="img" aria-label="Applications sent per week versus target">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={apps} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="sent" name="Sent" fill="var(--ink-2)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="target" name="Target" stroke="var(--ink-3)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Sleep */}
      <SectionLabel>Sleep</SectionLabel>
      <Card>
        {p.sleep.length >= 2 ? (
          <div className="h-40" role="img" aria-label="Hours slept on days you entered it">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={p.sleep.map((s) => ({ date: formatDay(s.date, 'D MMM'), hours: s.hours }))} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} domain={[3, 10]} />
                <Tooltip {...tooltipStyle} />
                <ReferenceLine y={7} stroke="var(--ink-3)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="hours" name="Hours" stroke="var(--ink)" strokeWidth={2} dot={{ r: 2, fill: 'var(--ink)' }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NotEnoughData>Not enough data yet — only days where you entered sleep are plotted, and gaps stay gaps.</NotEnoughData>
        )}
      </Card>

      {/* Streak heatmap */}
      <SectionLabel right={<span className="t-meta text-ink-2">{p.streak}d now · {p.longest}d best</span>}>Consistency</SectionLabel>
      <Card>
        <div className="flex gap-[3px] overflow-x-auto" role="img" aria-label={`Daily minutes logged, last ${HEAT_WEEKS} weeks`} data-testid="heatmap">
          {heat.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((c) => (
                <span
                  key={c.date}
                  title={`${formatDay(c.date)}: ${c.minutes} min`}
                  data-level={c.level}
                  className="block size-3 rounded-[3px]"
                  style={{ background: c.future ? 'transparent' : c.level === 0 ? 'var(--raised)' : `color-mix(in srgb, var(--ink) ${[0, 25, 45, 70, 100][c.level]}%, var(--raised))` }}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="t-meta mt-2 text-ink-2">Each square is a day; darker = more minutes logged. A missed day is just an empty square.</p>
      </Card>
    </Screen>
  )
}
