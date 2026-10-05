import { Link } from 'react-router'
import { Icon, type IconName } from '@/ui/Icon'
import { Screen, ScreenTitle } from '@/ui/primitives'

const ITEMS: { to: string; label: string; sub: string; icon: IconName }[] = [
  { to: '/plan', label: 'Plan', sub: '18 weeks, targets vs actual, Sunday review', icon: 'list' },
  { to: '/opportunities', label: 'Opportunities', sub: 'Hiring windows, hackathons, open source', icon: 'target' },
  { to: '/progress', label: 'Progress', sub: 'Burn-up, minutes, sleep, streak, AI-off', icon: 'chart' },
  { to: '/applications', label: 'Applications', sub: 'Status tracker', icon: 'briefcase' },
  { to: '/notes', label: 'Notes', sub: 'Blocks, links and search', icon: 'note' },
  { to: '/timetable', label: 'Timetable', sub: 'Your college week', icon: 'table' },
  { to: '/settings', label: 'Settings', sub: 'Sync, theme, backup, diagnostics', icon: 'settings' },
]

export function MoreScreen() {
  return (
    <Screen>
      <ScreenTitle>more</ScreenTitle>
      <ul className="flex flex-col gap-2">
        {ITEMS.map((it) => (
          <li key={it.to}>
            <Link to={it.to} className="press flex items-center gap-3 rounded-[14px] bg-surface p-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-raised">
                <Icon name={it.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-body-strong block">{it.label}</span>
                <span className="t-label block text-ink-2">{it.sub}</span>
              </span>
              <Icon name="chevron-right" size={18} className="text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
