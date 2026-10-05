import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { applyMotionTokens } from '@/ui/motion'
import { ThemeProvider } from '@/ui/theme'
import { router } from '@/routes'
import { Boot } from '@/features/shell/Boot'

applyMotionTokens()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Boot>
        <RouterProvider router={router} />
      </Boot>
    </ThemeProvider>
  </StrictMode>,
)
