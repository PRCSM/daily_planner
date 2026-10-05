import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeChoice = 'dark' | 'light' | 'system'
const KEY = 'cadence.theme'

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark' // dark first
  } catch {
    return 'dark'
  }
}

function resolve(choice: ThemeChoice): 'dark' | 'light' {
  if (choice !== 'system') return choice
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

interface ThemeCtx {
  choice: ThemeChoice
  resolved: 'dark' | 'light'
  setChoice: (c: ThemeChoice) => void
}
const Ctx = createContext<ThemeCtx>({ choice: 'dark', resolved: 'dark', setChoice: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored)
  const [resolved, setResolved] = useState<'dark' | 'light'>(() => resolve(readStored()))

  useEffect(() => {
    const apply = () => {
      const r = resolve(choice)
      setResolved(r)
      document.documentElement.dataset.theme = r
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', r === 'dark' ? '#1C1C1A' : '#FAF9F6')
    }
    apply()
    if (choice !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [choice])

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, c)
    } catch {
      /* private mode — theme just won't persist */
    }
    setChoiceState(c)
  }, [])

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
