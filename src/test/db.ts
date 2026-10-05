import { afterEach, beforeEach } from 'vitest'
import { resetDb } from '@/data/db'
import { localDate, setClockSource } from '@/lib/clock'
import { T0 } from './factories'

/**
 * Fresh fake-indexeddb database + a fixed clock (T0, 10:00 local) per test.
 * Teardown lets in-flight live-query re-runs (triggered by the test's last write) finish BEFORE the next test
 * closes the database — otherwise fake-indexeddb reports a PrematureCommitError for work nobody is waiting on.
 */
export function freshDbPerTest(date: string = T0, time = '10:00') {
  beforeEach(() => {
    resetDb()
    setClockSource(() => localDate(date, time))
  })
  afterEach(async () => {
    setClockSource()
    await new Promise((r) => setTimeout(r, 40))
  })
}
