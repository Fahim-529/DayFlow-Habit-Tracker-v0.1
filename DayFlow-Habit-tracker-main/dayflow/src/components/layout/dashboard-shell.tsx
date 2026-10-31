'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'
import { MobileTopBar } from './sidebar'

export interface DashboardShellProps {
  children: React.ReactNode
  className?: string
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const pathname = usePathname()

  return (
    <div className="relative min-h-screen bg-background">
      <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Sidebar overlay (small screens only) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Wrapper keeps content clear of the fixed 16rem sidebar; page padding goes on the inner div */}
      <div className="md:pl-64">
        <div className={`min-h-screen bg-background ${className ?? ''}`}>{children}</div>
      </div>
    </div>
  )
}
