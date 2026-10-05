import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, MAX_IMPORT_BYTES, MAX_IMPORT_SLOTS, cellSlot, kindFor, parseCsv, parseDay, parseIcs, parseTime, parseTimetableFile, periodsOf, readCsv } from './timetable'

describe('timetable periods', () => {
  it('6 consecutive periods of 50 minutes from 09:00', () => {
    const p = periodsOf(DEFAULT_LAYOUT)
    expect(p).toHaveLength(6)
    expect(p[0]).toEqual({ index: 0, start: '09:00', end: '09:50' })
    expect(p[5]).toEqual({ index: 5, start: '13:10', end: '14:00' })
  })
  it('cellSlot finds by day + period start, ignoring inactive slots', () => {
    const [p0] = periodsOf(DEFAULT_LAYOUT)
    const slots = [{ title: 'Maths', dayOfWeek: 2, startTime: '09:00', endTime: '09:50' }, { title: 'Old', dayOfWeek: 3, startTime: '09:00', endTime: '09:50', active: false }]
    expect(cellSlot(slots, 2, p0!)?.title).toBe('Maths')
    expect(cellSlot(slots, 3, p0!)).toBeUndefined()
    expect(cellSlot(slots, 1, p0!)).toBeUndefined()
  })
  it('kind detection', () => {
    expect([kindFor('Physics Lab'), kindFor('Lunch break'), kindFor('Algorithms'), kindFor('Practical: OS')]).toEqual(['LAB', 'BREAK', 'CLASS', 'LAB'])
  })
})

describe('parseTime / parseDay', () => {
  it('accepts common forms', () => {
    const cases: [string, string | null][] = [['9:00', '09:00'], ['09:30', '09:30'], ['9am', '09:00'], ['9:30 pm', '21:30'], ['12am', '00:00'], ['12pm', '12:00'], ['1730', '17:30'], ['24:00', null], ['9:60', null], ['13pm', null], ['noon', null], ['', null]]
    for (const [i, o] of cases) expect(parseTime(i), i).toBe(o)
  })
  it('days by name or number (0 = Sunday)', () => {
    expect([parseDay('Mon'), parseDay('thursday'), parseDay('0'), parseDay('6'), parseDay('7'), parseDay('funday')]).toEqual([1, 4, 0, 6, null, null])
  })
})

describe('CSV import — a trust boundary', () => {
  it('reads quoted fields, escaped quotes and CRLF', () => {
    expect(readCsv('a,"b,c","d ""q"""\r\n1,2,3')).toEqual([['a', 'b,c', 'd "q"'], ['1', '2', '3']])
  })
  it('parses a valid file with header aliases and infers kind', () => {
    const r = parseCsv('Subject,Weekday,From,To,Room\nPhysics Lab,Tue,2pm,4pm,Block B\nMaths,Mon,09:00,09:50,')
    expect(r.errors).toEqual([])
    expect(r.slots).toEqual([
      { title: 'Physics Lab', dayOfWeek: 2, startTime: '14:00', endTime: '16:00', location: 'Block B', kind: 'LAB', active: true },
      { title: 'Maths', dayOfWeek: 1, startTime: '09:00', endTime: '09:50', location: undefined, kind: 'CLASS', active: true },
    ])
  })
  it('reports every bad row with its line number and keeps the good ones', () => {
    const r = parseCsv('title,day,start,end\nOK,Mon,9,10\n,Mon,9,10\nBadDay,Someday,9,10\nBadTime,Tue,x,10\nBackwards,Tue,11,10')
    expect(r.slots.map((s) => s.title)).toEqual(['OK'])
    expect(r.errors.map((e) => e.where)).toEqual(['line 3', 'line 4', 'line 5', 'line 6'])
  })
  it('missing columns is a header error and nothing is imported', () => {
    const r = parseCsv('title,day\nMaths,Mon')
    expect(r.slots).toEqual([])
    expect(r.errors.map((e) => e.message)).toEqual(['Missing a “start” column.', 'Missing a “end” column.'])
  })
  it('empty and oversized files are refused', () => {
    expect(parseCsv('').errors[0]!.message).toMatch(/empty/)
    expect(parseCsv('x'.repeat(MAX_IMPORT_BYTES + 1)).errors[0]!.message).toMatch(/too large/)
  })
  it('strips control characters and caps title length (untrusted text)', () => {
    const r = parseCsv(`title,day,start,end\n"A\u0007B${'x'.repeat(200)}",Mon,9,10`)
    expect(r.slots[0]!.title.includes('\u0007')).toBe(false)
    expect(r.slots[0]!.title.length).toBeLessThanOrEqual(80)
  })
  it('stops at the row cap with a warning', () => {
    const rows = Array.from({ length: MAX_IMPORT_SLOTS + 20 }, (_, i) => `S${i},Mon,9,10`).join('\n')
    const r = parseCsv(`title,day,start,end\n${rows}`)
    expect(r.slots).toHaveLength(MAX_IMPORT_SLOTS)
    expect(r.warnings).toHaveLength(1)
  })
  it('does not execute or interpret markup — it is just text', () => {
    const r = parseCsv('title,day,start,end\n<img src=x onerror=alert(1)>,Mon,9,10')
    expect(r.slots[0]!.title).toBe('<img src=x onerror=alert(1)>')
  })
})

const ICS = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`
describe('ICS import — a trust boundary', () => {
  it('weekly recurring events expand BYDAY into one slot per day', () => {
    const r = parseIcs(ICS('BEGIN:VEVENT\r\nSUMMARY:Algorithms\r\nDTSTART;TZID=Asia/Kolkata:20260803T090000\r\nDTEND;TZID=Asia/Kolkata:20260803T095000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\nLOCATION:Room 5\r\nEND:VEVENT'))
    expect(r.errors).toEqual([])
    expect(r.slots.map((s) => [s.dayOfWeek, s.startTime, s.endTime, s.location])).toEqual([[1, '09:00', '09:50', 'Room 5'], [3, '09:00', '09:50', 'Room 5'], [5, '09:00', '09:50', 'Room 5']])
  })
  it('a one-off event becomes a weekly slot on its weekday, with a warning', () => {
    const r = parseIcs(ICS('BEGIN:VEVENT\r\nSUMMARY:Seminar\r\nDTSTART:20260804T140000\r\nDTEND:20260804T153000\r\nEND:VEVENT'))
    expect(r.slots).toHaveLength(1)
    expect(r.slots[0]!.dayOfWeek).toBe(2) // 4 Aug 2026 is a Tuesday — derived from the date, not the clock
    expect(r.warnings[0]!.message).toMatch(/single event/)
  })
  it('unfolds continuation lines and unescapes text', () => {
    const r = parseIcs(ICS('BEGIN:VEVENT\r\nSUMMARY:Data\r\n  Structures\\, Part 1\r\nDTSTART:20260803T100000\r\nDTEND:20260803T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT'))
    expect(r.slots[0]!.title).toBe('Data Structures, Part 1')
  })
  it('rejects non-calendar files, all-day events, and backwards times — per event', () => {
    expect(parseIcs('hello').errors[0]!.message).toMatch(/doesn’t look like/)
    const r = parseIcs(ICS('BEGIN:VEVENT\r\nSUMMARY:All day\r\nDTSTART;VALUE=DATE:20260803\r\nDTEND;VALUE=DATE:20260804\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Back\r\nDTSTART:20260803T110000\r\nDTEND:20260803T100000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Good\r\nDTSTART:20260803T090000\r\nDTEND:20260803T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT'))
    expect(r.slots.map((s) => s.title)).toEqual(['Good'])
    expect(r.errors).toHaveLength(2)
  })
  it('de-duplicates identical slots; an empty calendar is an error', () => {
    const ev = 'BEGIN:VEVENT\r\nSUMMARY:X\r\nDTSTART:20260803T090000\r\nDTEND:20260803T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT'
    expect(parseIcs(ICS(`${ev}\r\n${ev}`)).slots).toHaveLength(1)
    expect(parseIcs(ICS('')).errors[0]!.message).toMatch(/No events/)
  })
  it('routes by extension', () => {
    expect(parseTimetableFile('week.ics', ICS('')).errors[0]!.message).toMatch(/No events/)
    expect(parseTimetableFile('week.csv', 'title,day,start,end\nA,Mon,9,10').slots).toHaveLength(1)
  })
  it('hostile input does not hang or throw', () => {
    expect(() => parseIcs(ICS('BEGIN:VEVENT\r\n' + 'X:'.repeat(5000) + '\r\nEND:VEVENT'))).not.toThrow()
    expect(() => parseCsv('"' + 'a'.repeat(100000))).not.toThrow()
  })
})
