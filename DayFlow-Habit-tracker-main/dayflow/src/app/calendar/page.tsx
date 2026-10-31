'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar as CalendarIcon,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import { getScheduledTasksByUser } from '@/lib/db'
import type { ScheduledTask } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DashboardShell } from '@/components/layout/dashboard-shell'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const router = useRouter()
  const { account, isAuthenticated, logout } = useAuth()
  const { toast } = useToast()
  const [viewDate, setViewDate] = React.useState(() => new Date())
  const [tasks, setTasks] = React.useState<ScheduledTask[]>([])
  const [selectedDate, setSelectedDate] = React.useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadTasks()
  }, [isAuthenticated, router])

  async function loadTasks() {
    if (!account) return
    setLoading(true)
    try {
      const all = await getScheduledTasksByUser(account.id)
      setTasks(all)
    } finally {
      setLoading(false)
    }
  }

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const days = eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 0 }), end: endOfWeek(monthEnd, { weekStartsOn: 0 }) })

  const tasksByDate: Record<string, ScheduledTask[]> = {}
  tasks.forEach((t) => {
    if (!tasksByDate[t.scheduledDate]) tasksByDate[t.scheduledDate] = []
    tasksByDate[t.scheduledDate].push(t)
  })

  function prevMonth() {
    setViewDate((d) => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() - 1)
      return nd
    })
  }
  function nextMonth() {
    setViewDate((d) => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + 1)
      return nd
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
      </div>
    )
  }

  if (!isAuthenticated || !account) return null

  const dayTasks = tasksByDate[selectedDate] || []

  return (
    <DashboardShell className="min-h-screen bg-background p-4 lg:p-6">
      <nav className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">View and move your scheduled tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={logout} aria-label="Sign out" />
        </div>
      </nav>

      <div className="flex flex-col lg:flex-row gap-4">
        <aside className="w-full lg:w-80 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="sm" onClick={prevMonth} className="w-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold">{format(viewDate, 'MMMM yyyy')}</span>
            <Button variant="outline" size="sm" onClick={nextMonth} className="w-10">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 text-xs text-muted-foreground mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isCurrentMonth = isSameMonth(day, viewDate)
              const isSel = isSameDay(day, parseISO(selectedDate))
              const dayTasks = tasksByDate[format(day, 'yyyy-MM-dd')] || []
              const done = dayTasks.filter((t) => t.status === 'completed').length
              const total = dayTasks.length
              return (
                <button
                  key={format(day, 'yyyy-MM-dd')}
                  onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}
                  className={`
                    aspect-square rounded-xl flex flex-col items-center justify-center text-xs transition-colors
                    ${!isCurrentMonth ? 'text-muted-foreground/40' : ''}
                    ${isSel ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}
                  `}
                  aria-label={format(day, 'PPP')}
                >
                  <span className="font-medium">{day.getDate()}</span>
                  {total > 0 && (
                    <div className={`mt-1 h-1.5 w-1.5 rounded-full ${done === total && total > 0 ? 'bg-emerald-500' : done > 0 ? 'bg-amber-500' : 'bg-border'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{format(parseISO(selectedDate), 'EEEE, MMM d, yyyy')}</h2>
            <Link href="/today">
              <Button variant="outline" size="sm">
                Go to Today
              </Button>
            </Link>
          </div>

          const dayTasks = tasksByDate[selectedDate] || []

          const dayTasks = tasksByDate[selectedDate] || []

          {dayTasks.length === 0 ? (
            <Card className="border-dashed py-12">
              <div className="text-center">
                <CalendarIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">No tasks on this day</h3>
                <p className="text-sm text-muted-foreground">Select another date or add tasks.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {dayTasks.map((task: ScheduledTask) => (
                <Card key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{task.title}</span>
                      {task.carryoverSourceId && (
                        <Badge variant="warning" className="ml-1 text-xs">Carried over</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {task.trackingType === 'checkbox' ? 'Checkbox task' : `${task.trackingType} — target ${task.targetValue ?? '—'} ${task.targetUnit ?? ''}`}
                    </div>
                  </div>
                  <Badge variant={task.status === 'completed' ? 'success' : task.status === 'partial' ? 'warning' : 'default'}>
                    {task.status === 'completed' ? 'Done' : task.status === 'partial' ? 'Partial' : task.status === 'skipped' ? 'Skipped' : 'Pending'}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </DashboardShell>
  )
}
