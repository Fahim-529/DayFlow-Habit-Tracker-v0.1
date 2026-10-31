'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Calendar,
  FileText,
  BarChart3,
  LogOut,
  Menu,
  ChevronLeft,
  Download,
  Trash2,
  Link as LinkIcon,
  Cloud,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth'
import { exportUserData, deleteAllUserData } from '@/lib/db'
import { useTheme } from '@/hooks/use-theme'
import { isSupabaseConfigured } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/today', label: 'Today', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/plans', label: 'My Plans', icon: FileText },
  { href: '/progress', label: 'Progress', icon: BarChart3 },
] as const

export interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { setTheme, theme } = useTheme()
  const { account, logout, unlinkOnline } = useAuth()
  const supabaseConfigured = isSupabaseConfigured()
  const [exportOpen, setExportOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  async function handleExport() {
    if (!account) return
    try {
      const data = await exportUserData(account.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dayflow-export-${account.username}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed', err)
      window.alert('Export failed. Please try again.')
    }
    setExportOpen(false)
  }

  async function handleDelete() {
    if (!account) return
    if (
      !window.confirm(
        `WARNING: This will permanently delete ALL local data for account "${account.username}", including the account itself.\n\nThis includes habits, roadmaps, tasks, progress, and PDFs.\n\nThis action cannot be undone. Local data deletion is separate from cloud-synced data.\n\nContinue?`
      )
    ) {
      return
    }
    try {
      await deleteAllUserData(account.id)
    } catch (err) {
      console.error('Delete failed', err)
      window.alert('Could not delete your data. Please try again.')
      return
    }
    setDeleteOpen(false)
    await logout()
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transition-transform duration-300 md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white">
              <span className="text-sm font-bold">D</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">DayFlow</span>
          </div>
          <button className="md:hidden text-muted-foreground" onClick={onClose}>
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onClose()}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
              {account?.username?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-medium truncate">{account?.username || 'User'}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {account?.accountType === 'local' ? (
                  <span>Local account</span>
                ) : (
                  <span>Linked online</span>
                )}
                {supabaseConfigured && account?.isLinkedOnline && (
                  <>
                    {' • '}
                    <Badge variant="success" size="sm">Synced</Badge>
                  </>
                )}
              </div>
            </div>
          </div>

          {account && supabaseConfigured && !account.isLinkedOnline && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full mb-2"
              onClick={() => {
                // Navigate to account linking (would be a separate page)
                alert('Account linking: log in with Supabase to enable cloud sync across devices.')
              }}
            >
              <LinkIcon className="h-3 w-3 mr-2" /> Link Online Account
            </Button>
          )}

          <div className="flex gap-1 mb-4">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleExport}
            >
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete Data
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full mb-2"
            onClick={() => {
              logout()
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Theme:</span>
            <Button variant="ghost" size="icon" onClick={() => setTheme('light')} aria-label="Light theme">
              <span className="h-3 w-3 rounded-full bg-yellow-200 dark:bg-yellow-800" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setTheme('dark')} aria-label="Dark theme">
              <span className="h-3 w-3 rounded-full bg-indigo-500 dark:bg-indigo-300" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between px-4 border-b border-background bg-background/80 backdrop-blur md:hidden">
      <button className="text-muted-foreground" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="h-6 w-6" />
      </button>
      <span className="font-semibold text-lg tracking-tight">DayFlow</span>
      <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white">
        <span className="text-sm font-bold">D</span>
      </div>
    </div>
  )
}
