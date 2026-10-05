import { create } from 'zustand'
import type { Track } from '@/lib/enums'

/** Ephemeral UI state ONLY (open sheets, filters). Anything durable lives in Dexie. */
export interface LogPrefill {
  track?: Track
  minutes?: number
  topic?: string
}

export type SheetName = 'event' | 'task' | 'application' | 'note'

interface UiState {
  /** Day shown on Today (null = the real today). */
  selectedDate: string | null
  setSelectedDate: (d: string | null) => void

  log: { open: boolean; date: string | null; prefill: LogPrefill | null }
  openLog: (date?: string, prefill?: LogPrefill) => void
  closeLog: () => void
  setLogDate: (d: string) => void

  sheet: { name: SheetName | null; payload?: unknown }
  openSheet: (name: SheetName, payload?: unknown) => void
  closeSheet: () => void

  /** The day the planner is showing (so the FAB's "Add task" lands on it). */
  plannerDate: string | null
  setPlannerDate: (d: string | null) => void

  calendarFilters: string[]
  toggleCalendarFilter: (f: string) => void
}

export const useUi = create<UiState>((set) => ({
  selectedDate: null,
  setSelectedDate: (selectedDate) => set({ selectedDate }),

  log: { open: false, date: null, prefill: null },
  openLog: (date, prefill) => set({ log: { open: true, date: date ?? null, prefill: prefill ?? null } }),
  closeLog: () => set((s) => ({ log: { ...s.log, open: false } })),
  setLogDate: (date) => set((s) => ({ log: { ...s.log, date } })),

  sheet: { name: null },
  openSheet: (name, payload) => set({ sheet: { name, payload } }),
  closeSheet: () => set({ sheet: { name: null } }),

  plannerDate: null,
  setPlannerDate: (plannerDate) => set({ plannerDate }),

  calendarFilters: [],
  toggleCalendarFilter: (f) => set((s) => ({ calendarFilters: s.calendarFilters.includes(f) ? s.calendarFilters.filter((x) => x !== f) : [...s.calendarFilters, f] })),
}))
