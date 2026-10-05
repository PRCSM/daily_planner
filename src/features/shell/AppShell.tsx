import { Outlet, useLocation } from 'react-router'
import { BottomNav, type FabAction, type NavItem } from '@/ui/Nav'
import { LogSheet } from '@/features/log/LogSheet'
import { useUi } from '@/features/store'
import { GlobalSheets } from './GlobalSheets'

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/learn', label: 'Learn', icon: 'learn' },
  { to: '/planner', label: 'Planner', icon: 'planner' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/more', label: 'More', icon: 'more' },
]

export function navIndexFor(pathname: string): number {
  if (pathname === '/') return 0
  if (pathname.startsWith('/learn')) return 1
  if (pathname.startsWith('/planner')) return 2
  if (pathname.startsWith('/calendar')) return 3
  return 4 // /more and everything reached from it
}

/** Layout for every screen: routed content, the floating nav + FAB, and the PRE-MOUNTED sheets. */
export function AppShell() {
  const { pathname } = useLocation()
  const openLog = useUi((s) => s.openLog)
  const openSheet = useUi((s) => s.openSheet)
  const actions: FabAction[] = [
    { label: 'Log today', icon: 'edit', onSelect: () => openLog() },
    { label: 'Add task', icon: 'check', onSelect: () => openSheet('task', { date: useUi.getState().plannerDate ?? undefined }) },
    { label: 'Add event', icon: 'calendar', onSelect: () => openSheet('event') },
    { label: 'Save application', icon: 'briefcase', onSelect: () => openSheet('application') },
    { label: 'New note', icon: 'note', onSelect: () => openSheet('note') },
  ]
  return (
    <>
      <Outlet />
      <BottomNav items={NAV} actions={actions} activeIndex={navIndexFor(pathname)} />
      <LogSheet />
      <GlobalSheets />
    </>
  )
}
