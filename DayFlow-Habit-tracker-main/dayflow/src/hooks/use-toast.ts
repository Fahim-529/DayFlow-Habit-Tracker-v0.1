'use client'

import { useContext } from 'react'
import { ToastContext } from '@/components/ui/toaster'

export function useToast() {
  const { addToast, removeToast } = useContext(ToastContext)

  const toast = (props: {
    title?: string
    description?: string
    action?: React.ReactNode
  }) => {
    const id = addToast({ title: props.title, description: props.description, action: props.action })
    setTimeout(() => removeToast(id), 4000)
  }

  return { toast }
}
