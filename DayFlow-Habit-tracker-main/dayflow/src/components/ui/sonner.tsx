'use client'

import * as React from 'react'
import { ToastProvider } from '@/components/ui/toaster'

export function Toaster({ children }: { children?: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
