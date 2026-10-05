/** Shared string unions. Pure constants — no imports. */

export const EVENT_TYPES = ['STUDY_BLOCK', 'MILESTONE', 'HIRING_WINDOW', 'HACKATHON', 'APPLICATION_TASK', 'OSS_DEADLINE', 'CUSTOM'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const CRITICALITIES = ['HARD', 'SOFT', 'INFO'] as const
export type Criticality = (typeof CRITICALITIES)[number]

export const RECURRENCES = ['NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY'] as const
export type Recurrence = (typeof RECURRENCES)[number]

export const OCCURRENCE_STATUSES = ['DONE', 'SKIPPED', 'MOVED', 'EDITED'] as const
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number]

export const FIT_PILLS = ['APPLY', 'GOOD', 'MAYBE', 'LONGSHOT', 'CLOSED'] as const
export type FitPill = (typeof FIT_PILLS)[number]

export const SOURCE_MODULES = ['PLAN', 'OPPORTUNITY', 'APPLICATION', 'TIMETABLE', 'PLANNER', 'CALENDAR'] as const
export type SourceModule = (typeof SOURCE_MODULES)[number]

export const TRACKS = ['DSA', 'CORE_CS', 'SYSTEM_DESIGN', 'OOP_LLD', 'GENAI', 'PROJECT', 'APPLICATIONS', 'WRITING'] as const
export type Track = (typeof TRACKS)[number]
/** AI is OFF for learning; ON for shipping. */
export const LEARNING_TRACKS: readonly Track[] = ['DSA', 'CORE_CS', 'SYSTEM_DESIGN', 'OOP_LLD']
export const TRACK_LABEL: Record<Track, string> = {
  DSA: 'DSA',
  CORE_CS: 'Core CS',
  SYSTEM_DESIGN: 'System design',
  OOP_LLD: 'OOP / LLD',
  GENAI: 'GenAI',
  PROJECT: 'Project',
  APPLICATIONS: 'Applications',
  WRITING: 'Writing',
}

export const BLOCK_TYPES = ['DEEP_A', 'DEEP_B', 'BLOCK_C', 'WEEKEND', 'AD_HOC'] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

export const PHASES = ['FROM_SCRATCH', 'GET_PRESENTABLE', 'UNDER_ABSTRACTIONS', 'DESIGN_GENAI', 'CONVERT'] as const
export type Phase = (typeof PHASES)[number]
export const PHASE_LABEL: Record<Phase, string> = {
  FROM_SCRATCH: 'From scratch',
  GET_PRESENTABLE: 'Get presentable',
  UNDER_ABSTRACTIONS: 'Under the abstractions',
  DESIGN_GENAI: 'Design + GenAI',
  CONVERT: 'Convert',
}

export const DSA_STATUSES = ['SOLVED_UNAIDED', 'SOLVED_WITH_HINT', 'LOOKED_AT_SOLUTION', 'FAILED'] as const
export type DsaStatus = (typeof DSA_STATUSES)[number]
export const DSA_STATUS_LABEL: Record<DsaStatus, string> = {
  SOLVED_UNAIDED: 'Unaided',
  SOLVED_WITH_HINT: 'Hint',
  LOOKED_AT_SOLUTION: 'Saw solution',
  FAILED: 'Failed',
}
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const DSA_PATTERNS = [
  'Arrays', 'Strings', 'Two pointers', 'Sliding window', 'Hashing', 'Binary search', 'Linked list', 'Stack / queue',
  'Recursion', 'Trees', 'Heaps', 'Greedy', 'Graphs', 'DP', 'Tries', 'Backtracking', 'Bit tricks',
] as const

export const APPLICATION_STATUSES = ['SAVED', 'APPLIED', 'OA', 'INTERVIEW', 'OFFER', 'REJECTED', 'GHOSTED'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]
export const APPLICATION_TYPES = ['FULL_TIME', 'INTERNSHIP', 'CAMPUS', 'OSS', 'OTHER'] as const
export type ApplicationType = (typeof APPLICATION_TYPES)[number]

export const SLOT_KINDS = ['CLASS', 'LAB', 'BREAK', 'OTHER'] as const
export type SlotKind = (typeof SLOT_KINDS)[number]

export const PRIORITIES = ['MUST', 'SHOULD', 'COULD'] as const
export type Priority = (typeof PRIORITIES)[number]
export const TASK_STATUSES = ['TODO', 'DOING', 'DONE', 'MOVED', 'SKIPPED'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const CARD_TYPES = ['HOOK', 'CONCEPT', 'EXAMPLE', 'CODE', 'ANALOGY', 'WARNING', 'CHECK', 'SUMMARY'] as const
export type CardType = (typeof CARD_TYPES)[number]
export const PACK_SOURCES = ['SEEDED', 'AI_GENERATED', 'USER'] as const
export type PackSource = (typeof PACK_SOURCES)[number]

export const CHAT_ROLES = ['user', 'assistant'] as const
export type ChatRole = (typeof CHAT_ROLES)[number]
export const CHAT_CONTEXTS = ['GENERAL', 'PACK', 'CARD'] as const
export type ChatContext = (typeof CHAT_CONTEXTS)[number]

export const NOTE_BLOCK_TYPES = ['PARAGRAPH', 'HEADING', 'TODO', 'BULLET', 'CODE', 'QUOTE'] as const
export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number]
export const NOTE_LINK_TYPES = ['NONE', 'WEEK', 'EVENT', 'APPLICATION', 'DAY'] as const
export type NoteLinkType = (typeof NOTE_LINK_TYPES)[number]

export const SYNC_TABLES = [
  'events', 'eventOccurrences', 'dailyLogs', 'logBlocks', 'dsaProblems', 'applications', 'weeklyTargets', 'deliverables',
  'weeklyReviews', 'timetableSlots', 'plannerDays', 'plannerTasks', 'dailyQuotes', 'contentPacks', 'contentCards',
  'packProgress', 'chatThreads', 'chatMessages', 'notes', 'noteBlocks', 'appSettings', 'portals',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]
