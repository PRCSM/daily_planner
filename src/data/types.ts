/**
 * Row types. PURE — no Dexie import — so domain/ may import them (the only part of data/ it may).
 *
 * Conventions: ids are uuid text. Dates are "YYYY-MM-DD" strings (never Date objects). Times are
 * "HH:mm" local wall-clock. Every row carries id/createdAt/updatedAt/deletedAt/syncedAt:
 * deletes are SOFT so they can sync. Seeded rows carry seeded + userModified.
 */
import type {
  ApplicationStatus, ApplicationType, BlockType, CardType, ChatContext, ChatRole, Criticality, Difficulty, DsaStatus, EventType, FitPill,
  NoteBlockType, NoteLinkType, OccurrenceStatus, PackSource, Phase, Priority, Recurrence, SlotKind, SourceModule, TaskStatus, Track,
} from '@/lib/enums'

export interface BaseRow {
  id: string
  createdAt: string
  updatedAt: string
  /** Soft delete — a hard delete can't propagate. */
  deletedAt: string | null
  /** Local-only bookkeeping: when this version last reached the cloud. */
  syncedAt: string | null
}
export interface SeedFlags {
  seeded: boolean
  userModified: boolean
}

/** THE UNIFIED STORE. The plan, calendar, applications and timetable are ONE timeline of dated obligations. */
export interface EventRow extends BaseRow, SeedFlags {
  title: string
  type: EventType
  date: string
  /** recurrence NONE → a span across every date in [date, endDate]. Recurring → the last date of the pattern (inclusive). */
  endDate?: string
  startTime?: string
  endTime?: string
  track?: Track
  weekNumber?: number
  criticality: Criticality
  recurrence: Recurrence
  sourceModule: SourceModule
  linkUrl?: string
  fitPill?: FitPill
  caveat?: string
  notes?: string
  done: boolean
}

/** Per-date annotation on a (usually recurring) event. It can PLACE an occurrence, not just modify one. */
export interface EventOccurrenceRow extends BaseRow {
  eventId: string
  occurrenceDate: string
  status: OccurrenceStatus
  completedAt?: string
  movedToDate?: string
  overrideTitle?: string
  overrideStartTime?: string
  overrideEndTime?: string
  overrideNotes?: string
}

export interface DailyLogRow extends BaseRow {
  date: string
  weekNumber: number
  phase: Phase
  shipped?: string
  blockers?: string
  applicationsSent: number
  conceptsLearned: string[]
  sleepHours?: number
  trained: boolean
  /** Derived: true unless a learning block was logged with aiUsed. */
  aiOffRespected: boolean
  energy: number
  notes?: string
  /** Which fuel fields the user actually entered (never fabricate: carried-over defaults are not data). */
  fuelEntered?: boolean
}

export interface LogBlockRow extends BaseRow {
  logId: string
  /** Denormalised from the log so range queries need no join. */
  date: string
  /** DERIVED AT WRITE TIME from track + date, then stored — never recomputed. */
  blockType: BlockType
  track: Track
  minutes: number
  topic?: string
  aiUsed: boolean
  notes?: string
}

export interface DsaProblemRow extends BaseRow {
  title: string
  source: string
  url?: string
  pattern: string
  difficulty: Difficulty
  status: DsaStatus
  timeMinutes?: number
  solvedDate: string
  reviewDue: string | null
  reviewCount: number
  lastReviewedDate?: string
}

export interface ApplicationRow extends BaseRow {
  company: string
  role: string
  type: ApplicationType
  url?: string
  source?: string
  status: ApplicationStatus
  appliedDate?: string
  nextFollowUp?: string
  followUpEventId?: string
  resumeVariant?: string
  eventId?: string
  notes?: string
}

export interface WeeklyTargetRow extends BaseRow, SeedFlags {
  weekNumber: number
  startDate: string
  endDate: string
  phase: Phase
  theme: string
  dsaTarget: number
  applicationTarget: number
  topics: string[]
}

export interface DeliverableRow extends BaseRow, SeedFlags {
  weekNumber: number
  text: string
  done: boolean
  dueDate?: string
}

export interface WeeklyReviewRow extends BaseRow {
  weekNumber: number
  q1Dsa?: string
  q2Core?: string
  q3Shipped?: string
  q4Applications?: string
  /** TRI-STATE: null = unanswered (breaks a burnout run), true/false = an explicit answer. */
  q5FuelOk: boolean | null
  burnoutFlag: boolean
}

export interface TimetableSlotRow extends BaseRow {
  title: string
  /** 0 = Sunday */
  dayOfWeek: number
  startTime: string
  endTime: string
  location?: string
  kind: SlotKind
  sourceImport?: string
  active: boolean
  eventId?: string
}

export interface PlannerDayRow extends BaseRow {
  date: string
  intention?: string
}

export interface PlannerTaskRow extends BaseRow {
  dayId: string
  title: string
  startTime?: string
  endTime?: string
  linkedEventId?: string
  priority: Priority
  status: TaskStatus
  notes?: string
  orderIndex: number
  /** Track hint used to pre-fill the log sheet when the task is marked done. */
  track?: Track
}

export interface DailyQuoteRow extends BaseRow, SeedFlags {
  date?: string
  text: string
  author?: string
  source: string
  category?: string
  saved: boolean
}

export interface ContentPackRow extends BaseRow, SeedFlags {
  title: string
  track?: Track
  weekNumber?: number
  topic: string
  summary: string
  tags: string[]
  source: PackSource
  totalCards: number
  estimatedMinutes: number
}

export interface ContentCardRow extends BaseRow, SeedFlags {
  packId: string
  orderIndex: number
  type: CardType
  heading?: string
  body: string
  codeSnippet?: string
  codeLang?: string
}

export interface PackProgressRow extends BaseRow {
  packId: string
  date: string
  cardsViewed: number
  cardsTotal: number
  completed: boolean
  minutesSpent: number
}

export interface ChatThreadRow extends BaseRow {
  title: string
  contextType: ChatContext
  contextId?: string
  contextExcerpt?: string
}
export interface ChatMessageRow extends BaseRow {
  threadId: string
  role: ChatRole
  content: string
}

export interface NoteRow extends BaseRow {
  title: string
  linkType: NoteLinkType
  linkId?: string
}
export interface NoteBlockRow extends BaseRow {
  noteId: string
  type: NoteBlockType
  text: string
  checked?: boolean
  orderIndex: number
}

export interface AppSettingRow extends BaseRow {
  key: string
  value: unknown
}

/** Non-dated reference data (job portals). Dated things always go in `events`. */
export interface PortalRow extends BaseRow, SeedFlags {
  name: string
  category: string
  url: string
  fitPill: FitPill
  caveat?: string
}

/** Local-only: one pending mutation per (table,row) — latest write wins, so coalescing is free. */
export interface SyncQueueRow {
  /** `${table}:${rowId}` */
  id: string
  table: string
  rowId: string
  op: 'put' | 'delete'
  payload: Record<string, unknown>
  createdAt: string
  attemptedAt?: string
  attempts: number
  error?: string
}
export interface SyncMetaRow {
  key: string
  value: unknown
}

export interface TableRowMap {
  events: EventRow
  eventOccurrences: EventOccurrenceRow
  dailyLogs: DailyLogRow
  logBlocks: LogBlockRow
  dsaProblems: DsaProblemRow
  applications: ApplicationRow
  weeklyTargets: WeeklyTargetRow
  deliverables: DeliverableRow
  weeklyReviews: WeeklyReviewRow
  timetableSlots: TimetableSlotRow
  plannerDays: PlannerDayRow
  plannerTasks: PlannerTaskRow
  dailyQuotes: DailyQuoteRow
  contentPacks: ContentPackRow
  contentCards: ContentCardRow
  packProgress: PackProgressRow
  chatThreads: ChatThreadRow
  chatMessages: ChatMessageRow
  notes: NoteRow
  noteBlocks: NoteBlockRow
  appSettings: AppSettingRow
  portals: PortalRow
}
export type AnyRow = TableRowMap[keyof TableRowMap]
