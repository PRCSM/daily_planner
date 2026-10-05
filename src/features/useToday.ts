import { useEffect, useState } from 'react'
import { readClock } from '@/lib/clock'

/**
 * The current local date as a "YYYY-MM-DD" string, kept fresh across midnight and tab resumes.
 * (The ONLY thing that reads the clock is lib/clock; this just polls it.)
 */
export function useToday(): string {
  const [today, setToday] = useState(() => readClock().date)
  useEffect(() => {
    const tick = () => setToday((cur) => {
      const now = readClock().date
      return now === cur ? cur : now
    })
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return today
}

/** Local "HH:mm", refreshed every minute (for "now" markers). */
export function useNowTime(): string {
  const [t, setT] = useState(() => readClock().time)
  useEffect(() => {
    const id = setInterval(() => setT(readClock().time), 30_000)
    return () => clearInterval(id)
  }, [])
  return t
}
