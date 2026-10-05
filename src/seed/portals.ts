import type { FitPill } from '@/lib/enums'

export interface PortalSeed {
  key: string
  name: string
  category: string
  url: string
  fitPill: FitPill
  caveat?: string
}

export const PORTALS: PortalSeed[] = [
  { key: 'wellfound', name: 'Wellfound', category: 'Startup jobs', url: 'https://wellfound.com', fitPill: 'GOOD', caveat: 'Many listings are US-only or remote-US — filter to India / remote-friendly before you spend an evening.' },
  { key: 'yc-waas', name: 'YC Work at a Startup', category: 'Startup jobs', url: 'https://www.workatastartup.com', fitPill: 'MAYBE', caveat: 'Highest signal, but mostly US-based and wants shipped work. A strong GitHub matters more than the résumé here.' },
  { key: 'unstop', name: 'Unstop', category: 'Contests & hiring challenges', url: 'https://unstop.com', fitPill: 'GOOD', caveat: 'Where Indian company challenges (Flipkart GRiD, Amazon ML) are run. Skip the generic quiz-style events.' },
  { key: 'internshala', name: 'Internshala', category: 'Internships', url: 'https://internshala.com', fitPill: 'MAYBE', caveat: 'Volume over quality — many low-stipend or training-disguised listings. Filter by stipend and company.' },
  { key: 'cutshort', name: 'Cutshort', category: 'Startup jobs', url: 'https://cutshort.io', fitPill: 'GOOD', caveat: 'Good for Indian startups; profile-matching means recruiters come to you.' },
  { key: 'devfolio', name: 'Devfolio', category: 'Hackathons', url: 'https://devfolio.co', fitPill: 'MAYBE', caveat: 'Worth it only when the thing you build ends up in your portfolio.' },
  { key: 'hackerearth', name: 'HackerEarth', category: 'Contests & hiring challenges', url: 'https://www.hackerearth.com', fitPill: 'GOOD', caveat: 'Company-sponsored coding challenges double as interview pipelines.' },
  { key: 'gsoc', name: 'Google Summer of Code', category: 'Open source', url: 'https://summerofcode.withgoogle.com', fitPill: 'GOOD', caveat: 'Needs months of prior contributions to be competitive — start in December, not March.' },
  { key: 'lfx', name: 'LFX Mentorship', category: 'Open source', url: 'https://lfx.linuxfoundation.org', fitPill: 'GOOD', caveat: 'Paid mentorships with CNCF / Linux Foundation projects; less crowded than GSoC.' },
  { key: 'r-developersindia', name: 'r/developersIndia', category: 'Community', url: 'https://www.reddit.com/r/developersIndia', fitPill: 'MAYBE', caveat: 'Useful for referrals threads and offer comparisons; an easy place to lose an hour — time-box it.' },
  { key: 'inc42', name: 'Inc42', category: 'Startup news', url: 'https://inc42.com', fitPill: 'MAYBE', caveat: 'Funding news is a leading indicator of who is hiring. Read for leads, not for entertainment.' },
  { key: 'google-alerts', name: 'Google Alerts', category: 'Monitoring', url: 'https://www.google.com/alerts', fitPill: 'GOOD', caveat: 'Set alerts for “<company> campus hiring” and “<company> new grad” — free, silent, and it catches windows early.' },
]
