'use client'

import * as React from 'react'
import { cn } from '@/components/ui/cn'

type Toast = {
  id: string
  title?: string
  description?: string
  action?: React.ReactNode
}

type ToastContextValue = {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue>({
  toasts: [],
  addToast: () => '',
  removeToast: () => {},
})

export { ToastContext }


export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 11)
    setToasts((prev) => [{ id, ...toast }, ...prev].slice(0, 5))
    return id
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  )
}

export function ToastViewport() {
  const { toasts, removeToast } = React.useContext(ToastContext)

  return (
    <div className="fixed top-0 right-0 z-50 p-4 sm:flex sm:items-start sm:gap-4 sm:px-6 sm:py-6 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="m-4 max-w-sm w-full pointer-events-auto"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="bg-card border text-card-foreground shadow-lg rounded-lg p-4 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-1">
                {t.title && <h3 className="text-sm font-semibold">{t.title}</h3>}
                {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
              </div>
              {t.action && (
                <button className="ml-4 text-sm font-medium underline-offset-4 hover:underline text-primary">
                  {t.action}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
