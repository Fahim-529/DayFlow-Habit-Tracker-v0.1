'use client'

import { useTheme } from '@/hooks/use-theme'
import { useAuth } from '@/lib/auth'
import { Toaster } from '@/components/ui/sonner'
import { useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  // Applies the saved light/dark theme to <html>.
  useTheme()
  const init = useAuth((s) => s.init)

  // Restore/validate the signed-in session from the local database once on startup.
  useEffect(() => {
    void init()
  }, [init])

  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
