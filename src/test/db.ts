import { afterEach, beforeEach } from 'vitest'
import { resetDb } from '@/data/db'
import { localDate, setClockSource } from '@/lib/clock'
import { T0 } from './factories'

/** Fresh fake-indexeddb database + a fixed clock (T0, 10:00 local) per test. */
export function freshDbPerTest(date: string = T0, time = '10:00') {
  beforeEach(() => {
    resetDb()
    setClockSource(() => localDate(date, time))
  })
  afterEach(() => setClockSource())
}
