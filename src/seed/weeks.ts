import type { Phase } from '@/lib/enums'
import { PLAN_START, addDaysStr } from './util'

export interface WeekSeed {
  weekNumber: number
  phase: Phase
  theme: string
  dsaTarget: number
  applicationTarget: number
  topics: string[]
}

/**
 * 18 weeks, Week 1 starting Mon 13 Jul 2026. DSA targets sum to 363
 * (303 new patterns W1–14 + 60 revision W15–18). The 363 is DERIVED from these rows everywhere —
 * never a literal.
 *
 * Topics are lower-case tags; content packs match against them.
 */
export const WEEKS: WeekSeed[] = [
  { weekNumber: 1, phase: 'FROM_SCRATCH', theme: 'From scratch', dsaTarget: 3, applicationTarget: 0, topics: ['javascript', 'python', 'oop', 'testing'] },
  { weekNumber: 2, phase: 'GET_PRESENTABLE', theme: 'Get presentable', dsaTarget: 25, applicationTarget: 0, topics: ['arrays', 'strings', 'two pointers', 'python dsa toolkit'] },
  { weekNumber: 3, phase: 'GET_PRESENTABLE', theme: 'Get presentable', dsaTarget: 27, applicationTarget: 2, topics: ['sliding window', 'hashing'] },
  { weekNumber: 4, phase: 'GET_PRESENTABLE', theme: 'Get presentable', dsaTarget: 28, applicationTarget: 3, topics: ['binary search', 'dbms', 'http'] },
  { weekNumber: 5, phase: 'UNDER_ABSTRACTIONS', theme: 'Under the abstractions', dsaTarget: 20, applicationTarget: 5, topics: ['linked lists', 'stacks', 'dbms'] },
  { weekNumber: 6, phase: 'UNDER_ABSTRACTIONS', theme: 'Under the abstractions', dsaTarget: 20, applicationTarget: 5, topics: ['recursion', 'trees', 'os'] },
  { weekNumber: 7, phase: 'UNDER_ABSTRACTIONS', theme: 'Under the abstractions', dsaTarget: 20, applicationTarget: 5, topics: ['heaps', 'greedy', 'os'] },
  { weekNumber: 8, phase: 'UNDER_ABSTRACTIONS', theme: 'Under the abstractions', dsaTarget: 20, applicationTarget: 5, topics: ['networks', 'caching', 'http'] },
  { weekNumber: 9, phase: 'UNDER_ABSTRACTIONS', theme: 'Under the abstractions', dsaTarget: 20, applicationTarget: 5, topics: ['cdns', 'load balancing', 'queues', 'ci/cd'] },
  { weekNumber: 10, phase: 'DESIGN_GENAI', theme: 'Design + GenAI', dsaTarget: 24, applicationTarget: 10, topics: ['graphs', 'system design'] },
  { weekNumber: 11, phase: 'DESIGN_GENAI', theme: 'Design + GenAI', dsaTarget: 24, applicationTarget: 10, topics: ['dp', 'system design'] },
  { weekNumber: 12, phase: 'DESIGN_GENAI', theme: 'Design + GenAI', dsaTarget: 24, applicationTarget: 10, topics: ['dp', 'tries', 'system design'] },
  { weekNumber: 13, phase: 'DESIGN_GENAI', theme: 'Design + GenAI', dsaTarget: 24, applicationTarget: 10, topics: ['system design', 'genai', 'transformers'] },
  { weekNumber: 14, phase: 'DESIGN_GENAI', theme: 'Design + GenAI', dsaTarget: 24, applicationTarget: 10, topics: ['genai', 'rag', 'agents', 'multimodal'] },
  { weekNumber: 15, phase: 'CONVERT', theme: 'Convert', dsaTarget: 15, applicationTarget: 10, topics: ['revision', 'mocks'] },
  { weekNumber: 16, phase: 'CONVERT', theme: 'Convert', dsaTarget: 15, applicationTarget: 10, topics: ['revision', 'mocks', 'interviews'] },
  { weekNumber: 17, phase: 'CONVERT', theme: 'Convert', dsaTarget: 15, applicationTarget: 10, topics: ['revision', 'interviews'] },
  { weekNumber: 18, phase: 'CONVERT', theme: 'Convert', dsaTarget: 15, applicationTarget: 10, topics: ['revision', 'mocks', 'interviews'] },
]

export const weekStart = (n: number): string => addDaysStr(PLAN_START, (n - 1) * 7)
export const weekEnd = (n: number): string => addDaysStr(weekStart(n), 6)

export interface DeliverableSeed {
  weekNumber: number
  text: string
  dueDate?: string
}

/** Concrete things that must exist by Sunday. Editable — they are a starting point, not scripture. */
export const DELIVERABLES: DeliverableSeed[] = [
  { weekNumber: 1, text: 'Dev environment + this app in daily use (log every day)' },
  { weekNumber: 1, text: 'JS + Python refresher notes pushed to a repo' },
  { weekNumber: 2, text: 'Mimora: core flow working locally' },
  { weekNumber: 3, text: 'Mimora deployed — live URL', dueDate: '2026-08-02' },
  { weekNumber: 4, text: 'Resume v1 + GitHub profile README drafted' },
  { weekNumber: 5, text: 'Resume + GitHub + portfolio SHIPPED', dueDate: '2026-08-15' },
  { weekNumber: 6, text: 'First applications out (target in the week row)' },
  { weekNumber: 7, text: 'OS notes: processes, threads, scheduling, memory' },
  { weekNumber: 8, text: 'Caching write-up (blog or README)' },
  { weekNumber: 9, text: 'Mimora: CI/CD pipeline green' },
  { weekNumber: 10, text: 'Design doc #1: a URL shortener, end to end' },
  { weekNumber: 11, text: 'Design doc #2: a feed / notification system' },
  { weekNumber: 12, text: 'GenAI flagship: scoped, repo created' },
  { weekNumber: 13, text: 'GenAI flagship: RAG pipeline working' },
  { weekNumber: 14, text: 'GenAI flagship: agent / tool-use layer' },
  { weekNumber: 15, text: 'GenAI flagship: evals + demo polish' },
  { weekNumber: 16, text: 'GenAI flagship deployed + README', dueDate: '2026-11-01' },
  { weekNumber: 16, text: 'Two full mock interviews (DSA + design)' },
  { weekNumber: 17, text: 'Resume re-cut per application type' },
  { weekNumber: 18, text: 'Plan retrospective written', dueDate: '2026-11-15' },
]
