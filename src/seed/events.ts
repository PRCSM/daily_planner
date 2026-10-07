import type { EventRow } from '@/data/types'
import type { Criticality, EventType, FitPill } from '@/lib/enums'
import { PLAN_BEGIN, PLAN_END, PLAN_START, addDaysStr } from './util'
import { weekEnd, weekStart } from './weeks'

export type EventSeed = Omit<EventRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncedAt' | 'seeded' | 'userModified' | 'done'> & { key: string }

/** The daily rhythm. Times are defaults — edit any of them; an edited seed row is never overwritten by a re-seed. */
export const STUDY_EVENTS: EventSeed[] = [
  { key: 'study-deep-a', title: 'Deep A — DSA', type: 'STUDY_BLOCK', date: PLAN_BEGIN, endDate: PLAN_END, recurrence: 'WEEKDAYS', startTime: '06:30', endTime: '08:30', track: 'DSA', criticality: 'SOFT', sourceModule: 'PLAN', notes: 'AI off. This week’s patterns first; unseen problems, timed.' },
  { key: 'study-deep-b', title: 'Deep B — core / design', type: 'STUDY_BLOCK', date: PLAN_BEGIN, endDate: PLAN_END, recurrence: 'WEEKDAYS', startTime: '19:00', endTime: '21:00', track: 'CORE_CS', criticality: 'SOFT', sourceModule: 'PLAN', notes: 'AI off. The week’s non-DSA topic: CS fundamentals, system design, OOP/LLD.' },
  { key: 'study-block-c', title: 'Block C — apply · write · ship', type: 'STUDY_BLOCK', date: PLAN_BEGIN, endDate: PLAN_END, recurrence: 'WEEKDAYS', startTime: '21:00', endTime: '22:00', track: 'APPLICATIONS', criticality: 'SOFT', sourceModule: 'PLAN', notes: 'AI on. Applications, résumé, project work, writing.' },
  { key: 'study-weekend-build', title: 'Weekend build', type: 'STUDY_BLOCK', date: addDaysStr(PLAN_START, 5), endDate: PLAN_END, recurrence: 'WEEKLY', startTime: '09:00', endTime: '13:00', track: 'PROJECT', criticality: 'SOFT', sourceModule: 'PLAN', notes: 'Ship something. AI on.' },
  { key: 'study-weekend-dsa', title: 'Weekend DSA + revision', type: 'STUDY_BLOCK', date: addDaysStr(PLAN_START, 6), endDate: PLAN_END, recurrence: 'WEEKLY', startTime: '10:00', endTime: '12:00', track: 'DSA', criticality: 'SOFT', sourceModule: 'PLAN', notes: 'Clear the review queue first, then new problems.' },
  { key: 'study-sunday-review', title: 'Sunday review', type: 'STUDY_BLOCK', date: addDaysStr(PLAN_START, 6), endDate: PLAN_END, recurrence: 'WEEKLY', startTime: '20:00', endTime: '20:30', track: 'WRITING', criticality: 'SOFT', sourceModule: 'PLAN', notes: 'Five questions, honestly. Q5 is about sleep, training and rest.' },
]

const m = (key: string, title: string, date: string, criticality: Criticality, weekNumber: number, notes?: string): EventSeed => ({
  key, title, type: 'MILESTONE', date, criticality, recurrence: 'NONE', sourceModule: 'PLAN', weekNumber, notes,
})

export const MILESTONES: EventSeed[] = [
  m('ms-mimora', 'Mimora deploy done', weekEnd(3), 'HARD', 3, 'A live URL, not “almost”.'),
  m('ms-resume', 'RESUME + GITHUB + PORTFOLIO SHIPPED', addDaysStr(weekStart(5), 5), 'HARD', 5, 'Everything after this date assumes these exist. Applications start leaning on them.'),
  m('ms-flagship', 'GenAI flagship shipped', weekEnd(16), 'HARD', 16),
  m('ms-plan-end', 'Plan ends — write the retrospective', weekEnd(18), 'HARD', 18),
  m('ph-1', 'Phase 1 begins · From scratch', weekStart(1), 'INFO', 1),
  m('ph-2', 'Phase 2 begins · Get presentable', weekStart(2), 'INFO', 2),
  m('ph-3', 'Phase 3 begins · Under the abstractions', weekStart(5), 'INFO', 5),
  m('ph-4', 'Phase 4 begins · Design + GenAI', weekStart(10), 'INFO', 10),
  m('ph-5', 'Phase 5 begins · Convert', weekStart(15), 'INFO', 15),
]

/* ── Caveats: the judgement that stops the links pushing toward low-value options. VERBATIM. ── */
export const CAVEAT_GITHUB = 'US/Canada/Remote only — useful for the Remote listings, not for India.'
export const CAVEAT_SUMMER_2027 = 'Not your target — you graduate mid-2027 and most require returning to school.'
export const CAVEAT_QUANT = '~90% of Indian quant hires come from IIT-B/D/K and ISI. WorldQuant Alphathon is the one door with no college filter.'
export const CAVEAT_IT_SERVICES = 'Aptitude game, not engineering. Your floor, not your ceiling. One Saturday.'

interface Opp {
  key: string
  title: string
  type: Extract<EventType, 'HIRING_WINDOW' | 'HACKATHON' | 'OSS_DEADLINE'>
  start: string
  end?: string
  fit: FitPill
  caveat?: string
  url?: string
  crit?: Criticality
  notes?: string
}

const OPPS: Opp[] = [
  // ── July ──
  { key: 'amazon-sde', title: 'Amazon — SDE new-grad applications', type: 'HIRING_WINDOW', start: '2026-07-20', end: '2026-08-31', fit: 'APPLY', url: 'https://www.amazon.jobs' },
  { key: 'flipkart-grid', title: 'Flipkart GRiD — engineering challenge', type: 'HACKATHON', start: '2026-07-15', end: '2026-08-20', fit: 'GOOD', url: 'https://unstop.com' },
  { key: 'walmart', title: 'Walmart Global Tech — new-grad / intern hiring', type: 'HIRING_WINDOW', start: '2026-07-20', end: '2026-09-15', fit: 'GOOD', url: 'https://careers.walmart.com' },
  { key: 'gh-newgrad', title: 'SimplifyJobs — New-Grad positions tracker (GitHub)', type: 'HIRING_WINDOW', start: '2026-07-13', end: '2026-11-15', fit: 'MAYBE', caveat: CAVEAT_GITHUB, url: 'https://github.com/SimplifyJobs/New-Grad-Positions' },
  { key: 'gh-remote', title: 'Remote-only listings on GitHub trackers', type: 'HIRING_WINDOW', start: '2026-07-13', end: '2026-11-15', fit: 'MAYBE', caveat: CAVEAT_GITHUB, url: 'https://github.com/SimplifyJobs' },
  // ── August ──
  { key: 'microsoft', title: 'Microsoft — SDE new-grad / intern window', type: 'HIRING_WINDOW', start: '2026-08-03', end: '2026-10-31', fit: 'APPLY', crit: 'HARD', url: 'https://careers.microsoft.com', notes: 'Aug–Oct. Apply early in the window; referrals help.' },
  { key: 'goldman', title: 'Goldman Sachs — Engineering analyst', type: 'HIRING_WINDOW', start: '2026-08-10', end: '2026-09-30', fit: 'GOOD', url: 'https://www.goldmansachs.com/careers/' },
  { key: 'morgan-stanley', title: 'Morgan Stanley — Technology analyst', type: 'HIRING_WINDOW', start: '2026-08-10', end: '2026-09-30', fit: 'GOOD', url: 'https://www.morganstanley.com/careers' },
  { key: 'jpmorgan', title: 'JPMorgan — Software engineer program', type: 'HIRING_WINDOW', start: '2026-08-10', end: '2026-09-30', fit: 'GOOD', url: 'https://www.jpmorganchase.com/careers' },
  { key: 's27-opens', title: 'Summer-2027 internship cycle opens (US big-tech)', type: 'HIRING_WINDOW', start: '2026-08-17', end: '2026-12-15', fit: 'LONGSHOT', caveat: CAVEAT_SUMMER_2027 },
  { key: 's27-tracker', title: 'SimplifyJobs — Summer-2027 internships tracker', type: 'HIRING_WINDOW', start: '2026-08-17', end: '2026-12-15', fit: 'LONGSHOT', caveat: CAVEAT_SUMMER_2027, url: 'https://github.com/SimplifyJobs' },
  // ── September ──
  { key: 'amazon-ml', title: 'Amazon ML Challenge', type: 'HACKATHON', start: '2026-09-01', end: '2026-09-30', fit: 'GOOD', url: 'https://unstop.com' },
  { key: 'codevita', title: 'TCS CodeVita', type: 'HACKATHON', start: '2026-09-01', end: '2026-10-31', fit: 'GOOD', url: 'https://www.tcscodevita.com' },
  { key: 'sih', title: 'Smart India Hackathon (SIH)', type: 'HACKATHON', start: '2026-09-05', end: '2026-10-15', fit: 'MAYBE', url: 'https://www.sih.gov.in', caveat: 'Needs a six-person team and your college’s nodal approval — a lot of coordination for one project line.' },
  { key: 'campus-season', title: 'Campus placement season — your college’s drives', type: 'HIRING_WINDOW', start: '2026-09-01', end: '2026-11-15', fit: 'APPLY', crit: 'HARD', notes: 'Sep–Nov. Register for every drive; decide later.' },
  { key: 'unicorns', title: 'Unicorns & late-stage startups — new-grad season', type: 'HIRING_WINDOW', start: '2026-09-07', end: '2026-11-15', fit: 'GOOD', url: 'https://wellfound.com' },
  { key: 'its-mass-1', title: 'Infosys / Cognizant / Wipro mass-hiring drives', type: 'HIRING_WINDOW', start: '2026-09-14', end: '2026-11-30', fit: 'MAYBE', caveat: CAVEAT_IT_SERVICES },
  { key: 's27-univ', title: 'Summer-2027 — US university-recruiting events', type: 'HIRING_WINDOW', start: '2026-09-21', end: '2026-10-31', fit: 'LONGSHOT', caveat: CAVEAT_SUMMER_2027 },
  { key: 's27-second', title: 'Summer-2027 — second application wave', type: 'HIRING_WINDOW', start: '2026-09-28', end: '2026-11-15', fit: 'LONGSHOT', caveat: CAVEAT_SUMMER_2027 },
  // ── October ──
  { key: 'hacktoberfest', title: 'Hacktoberfest', type: 'OSS_DEADLINE', start: '2026-10-01', end: '2026-10-31', fit: 'GOOD', url: 'https://hacktoberfest.com', notes: 'Pick meaningful PRs into projects you could list on a résumé; ignore spam-PR bait.' },
  { key: 'quant', title: 'Quant & trading firms — India campus / off-campus', type: 'HIRING_WINDOW', start: '2026-10-01', end: '2026-11-30', fit: 'LONGSHOT', caveat: CAVEAT_QUANT },
  { key: 'adobe', title: 'Adobe — new-grad hiring', type: 'HIRING_WINDOW', start: '2026-10-05', end: '2026-11-15', fit: 'GOOD', url: 'https://www.adobe.com/careers.html' },
  { key: 'atlassian', title: 'Atlassian — new-grad / intern', type: 'HIRING_WINDOW', start: '2026-10-05', end: '2026-11-15', fit: 'GOOD', url: 'https://www.atlassian.com/company/careers' },
  { key: 'google', title: 'Google — SWE new-grad window (2–4 weeks only)', type: 'HIRING_WINDOW', start: '2026-10-12', end: '2026-11-02', fit: 'APPLY', crit: 'HARD', url: 'https://www.google.com/about/careers/applications/', notes: 'Mid-October. The window is SHORT — apply in the first week, with your résumé and referral ready beforehand.' },
  { key: 'alphathon', title: 'WorldQuant Alphathon', type: 'HACKATHON', start: '2026-10-15', end: '2026-11-30', fit: 'MAYBE', caveat: CAVEAT_QUANT, url: 'https://www.worldquant.com' },
  // ── November ──
  { key: 'six-month', title: '6-month internships — apply now (Jan–Jun starts)', type: 'HIRING_WINDOW', start: '2026-11-01', end: '2026-11-30', fit: 'APPLY', notes: 'Internship-to-offer route for next-semester starts.' },
  { key: 'tcs-nqt', title: 'TCS NQT', type: 'HIRING_WINDOW', start: '2026-11-01', end: '2026-11-30', fit: 'MAYBE', caveat: CAVEAT_IT_SERVICES, url: 'https://www.tcs.com/careers' },
  { key: 'wipro-nlth', title: 'Wipro NLTH / Elite', type: 'HIRING_WINDOW', start: '2026-11-01', end: '2026-11-30', fit: 'MAYBE', caveat: CAVEAT_IT_SERVICES, url: 'https://careers.wipro.com' },
  { key: 'offcampus-midsize', title: 'Off-campus new-grad — mid-size product companies', type: 'HIRING_WINDOW', start: '2026-11-09', end: '2026-12-15', fit: 'GOOD' },
  // ── December: the dead month ──
  { key: 'dec-dead', title: 'December is the dead month — protect revision', type: 'HIRING_WINDOW', start: '2026-12-01', end: '2026-12-31', fit: 'MAYBE', crit: 'INFO', notes: 'Few replies, few openings. Use it: revise, and start open-source contributions for GSoC.' },
  { key: 'gsoc-start', title: 'GSoC — start contributing now (orgs announced in Feb)', type: 'OSS_DEADLINE', start: '2026-12-01', end: '2027-02-28', fit: 'GOOD', url: 'https://summerofcode.withgoogle.com' },
  { key: 'dec-hackathons', title: 'Winter hackathons on Devfolio (ETHIndia & co.)', type: 'HACKATHON', start: '2026-12-05', end: '2026-12-31', fit: 'MAYBE', url: 'https://devfolio.co', caveat: 'Prize-chasing is a time sink — only worth it if the build lands in your portfolio.' },
  // ── Jan–Mar: the second peak ──
  { key: 'jan-peak', title: 'Second hiring peak — new-grad & off-campus roles', type: 'HIRING_WINDOW', start: '2027-01-05', end: '2027-02-28', fit: 'GOOD' },
  { key: 'jan-s27', title: 'Summer-2027 internship applications (rolling)', type: 'HIRING_WINDOW', start: '2027-01-05', end: '2027-03-15', fit: 'LONGSHOT', caveat: CAVEAT_SUMMER_2027 },
  { key: 'jan-gh', title: 'GitHub trackers — mid-year refresh', type: 'HIRING_WINDOW', start: '2027-01-05', end: '2027-03-31', fit: 'MAYBE', caveat: CAVEAT_GITHUB },
  { key: 'lfx-spring', title: 'LFX Mentorship — spring term', type: 'OSS_DEADLINE', start: '2027-02-01', end: '2027-02-28', fit: 'GOOD', url: 'https://lfx.linuxfoundation.org' },
  { key: 'gsoc-orgs', title: 'GSoC — organisations announced; draft proposals', type: 'OSS_DEADLINE', start: '2027-02-20', end: '2027-03-20', fit: 'GOOD', url: 'https://summerofcode.withgoogle.com' },
  { key: 'feb-startups', title: 'Startups & mid-size — Wellfound / Cutshort roles', type: 'HIRING_WINDOW', start: '2027-02-01', end: '2027-03-31', fit: 'GOOD', url: 'https://wellfound.com' },
  { key: 'gsoc-apply', title: 'GSoC — contributor application deadline', type: 'OSS_DEADLINE', start: '2027-03-16', end: '2027-04-03', fit: 'GOOD', crit: 'HARD', url: 'https://summerofcode.withgoogle.com' },
  { key: 'mar-intern', title: 'Summer internships in India (company programs, Internshala, Unstop)', type: 'HIRING_WINDOW', start: '2027-03-01', end: '2027-04-15', fit: 'GOOD', url: 'https://internshala.com' },
  { key: 'mar-its', title: 'IT-services off-campus drives (final wave)', type: 'HIRING_WINDOW', start: '2027-03-01', end: '2027-03-31', fit: 'MAYBE', caveat: CAVEAT_IT_SERVICES },
]

export const OPPORTUNITY_EVENTS: EventSeed[] = OPPS.map((o) => ({
  key: `opp-${o.key}`,
  title: o.title,
  type: o.type,
  date: o.start,
  endDate: o.end,
  criticality: o.crit ?? 'SOFT',
  recurrence: 'NONE',
  sourceModule: 'OPPORTUNITY',
  linkUrl: o.url,
  fitPill: o.fit,
  caveat: o.caveat,
  notes: o.notes,
}))

export const ALL_EVENT_SEEDS: EventSeed[] = [...STUDY_EVENTS, ...MILESTONES, ...OPPORTUNITY_EVENTS]
