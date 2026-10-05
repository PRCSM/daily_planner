export interface QuoteSeed {
  key: string
  text: string
  /** Omitted when the attribution isn't solid — never invent one. */
  author?: string
  source: string
  category: 'BUILDING' | 'DISCIPLINE' | 'RESILIENCE' | 'SHIPPING' | 'CRAFT'
}

/**
 * Real, attributed quotes. Where a famous line has a disputed origin (Aristotle “we are what we
 * repeatedly do” is Will Durant; “10,000 ways that won’t work” is unverified) it is either credited to
 * the verified source or left out.
 */
export const QUOTES: QuoteSeed[] = [
  { key: 'durant-habit', text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant', source: 'The Story of Philosophy (1926), summarising Aristotle', category: 'DISCIPLINE' },
  { key: 'jobs-ship', text: 'Real artists ship.', author: 'Steve Jobs', source: 'Macintosh team, 1983 (as recorded on folklore.org)', category: 'SHIPPING' },
  { key: 'knuth-premature', text: 'We should forget about small efficiencies, say about 97% of the time: premature optimization is the root of all evil.', author: 'Donald Knuth', source: 'Structured Programming with go to Statements (1974)', category: 'CRAFT' },
  { key: 'sicp-readers', text: 'Programs must be written for people to read, and only incidentally for machines to execute.', author: 'Harold Abelson & Gerald Jay Sussman', source: 'Structure and Interpretation of Computer Programs', category: 'CRAFT' },
  { key: 'beck-order', text: 'Make it work, make it right, make it fast.', author: 'Kent Beck', source: 'Software engineering maxim', category: 'BUILDING' },
  { key: 'dijkstra-simplicity', text: 'Simplicity is prerequisite for reliability.', author: 'Edsger W. Dijkstra', source: 'EWD498 (1975)', category: 'CRAFT' },
  { key: 'fall-seven', text: 'Fall seven times, stand up eight.', source: 'Japanese proverb', category: 'RESILIENCE' },
  { key: 'jobs-love', text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs', source: 'Stanford commencement address (2005)', category: 'BUILDING' },
  { key: 'brooks-throw', text: 'Plan to throw one away; you will, anyhow.', author: 'Fred Brooks', source: 'The Mythical Man-Month (1975)', category: 'BUILDING' },
  { key: 'brooks-law', text: 'Adding manpower to a late software project makes it later.', author: 'Fred Brooks', source: 'The Mythical Man-Month (1975)', category: 'BUILDING' },
  { key: 'torvalds-code', text: 'Talk is cheap. Show me the code.', author: 'Linus Torvalds', source: 'Linux kernel mailing list (2000)', category: 'SHIPPING' },
  { key: 'exupery-subtract', text: 'Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.', author: 'Antoine de Saint-Exupéry', source: 'Wind, Sand and Stars (1939)', category: 'CRAFT' },
  { key: 'pascal-shorter', text: 'I have made this longer than usual because I have not had time to make it shorter.', author: 'Blaise Pascal', source: 'Lettres provinciales (1657)', category: 'CRAFT' },
  { key: 'feynman-fool', text: 'The first principle is that you must not fool yourself — and you are the easiest person to fool.', author: 'Richard Feynman', source: 'Caltech commencement address (1974)', category: 'DISCIPLINE' },
  { key: 'feynman-create', text: 'What I cannot create, I do not understand.', author: 'Richard Feynman', source: 'Found on his blackboard at the time of his death (1988)', category: 'BUILDING' },
  { key: 'clear-systems', text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear', source: 'Atomic Habits (2018)', category: 'DISCIPLINE' },
  { key: 'clear-vote', text: 'Every action you take is a vote for the type of person you wish to become.', author: 'James Clear', source: 'Atomic Habits (2018)', category: 'DISCIPLINE' },
  { key: 'willink-discipline', text: 'Discipline equals freedom.', author: 'Jocko Willink', source: 'Discipline Equals Freedom: Field Manual (2017)', category: 'DISCIPLINE' },
  { key: 'sandberg-done', text: 'Done is better than perfect.', author: 'Sheryl Sandberg', source: 'Lean In (2013), quoting a Facebook office poster', category: 'SHIPPING' },
  { key: 'aurelius-way', text: 'The impediment to action advances action. What stands in the way becomes the way.', author: 'Marcus Aurelius', source: 'Meditations 5.20', category: 'RESILIENCE' },
  { key: 'seneca-imagination', text: 'We suffer more often in imagination than in reality.', author: 'Seneca', source: 'Letters to Lucilius, 13', category: 'RESILIENCE' },
  { key: 'edison-perspiration', text: 'Genius is one per cent inspiration, ninety-nine per cent perspiration.', author: 'Thomas Edison', source: 'Harper’s Monthly (1932)', category: 'DISCIPLINE' },
  { key: 'karlton-hard', text: 'There are only two hard things in Computer Science: cache invalidation and naming things.', author: 'Phil Karlton', source: 'Widely cited engineering maxim', category: 'CRAFT' },
  { key: 'kernighan-debug', text: 'Everyone knows that debugging is twice as hard as writing a program in the first place. So if you’re as clever as you can be when you write it, how will you ever debug it?', author: 'Brian Kernighan', source: 'The Elements of Programming Style (1974)', category: 'CRAFT' },
  { key: 'laozi-step', text: 'A journey of a thousand miles begins with a single step.', author: 'Laozi', source: 'Tao Te Ching, ch. 64', category: 'DISCIPLINE' },
  { key: 'collier-small', text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier', source: 'The Secret of the Ages (1926)', category: 'DISCIPLINE' },
  { key: 'maxim-slow', text: 'Slow is smooth, and smooth is fast.', source: 'Military maxim', category: 'DISCIPLINE' },
  { key: 'kay-simple', text: 'Simple things should be simple, complex things should be possible.', author: 'Alan Kay', source: 'Computer-science maxim', category: 'CRAFT' },
  { key: 'hofstadter', text: 'It always takes longer than you expect, even when you take into account Hofstadter’s Law.', author: 'Douglas Hofstadter', source: 'Gödel, Escher, Bach (1979)', category: 'BUILDING' },
  { key: 'yoda', text: 'Do. Or do not. There is no try.', author: 'Yoda', source: 'The Empire Strikes Back (1980)', category: 'DISCIPLINE' },
  { key: 'shedd-ship', text: 'A ship in harbor is safe, but that is not what ships are built for.', author: 'John A. Shedd', source: 'Salt from My Attic (1928)', category: 'SHIPPING' },
  { key: 'tyson-plan', text: 'Everybody has a plan until they get punched in the mouth.', author: 'Mike Tyson', source: 'Press conference (2012)', category: 'RESILIENCE' },
]
