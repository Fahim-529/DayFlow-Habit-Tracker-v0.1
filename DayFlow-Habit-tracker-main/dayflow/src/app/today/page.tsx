'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  Trash2,
  Activity,
  Calendar,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { format, subDays, addDays, isSameDay, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import {
  getScheduledTasksByDate,
  getScheduledTasksByUser,
  getHabitsByUser,
  saveScheduledTask,
  getDailyProgress,
  saveDailyProgress,
  hideScheduledTaskOccurrence,
  resetUserData,
  saveHabit,
} from '@/lib/db'
import type { Habit, ScheduledTask, TaskStatus, TrackingType } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import {
  addDays as schedAddDays,
  computeDailyCompletion,
  evaluateRecovery,
  moveTaskToDate,
  checkWorkload,
} from '@/lib/scheduling'

const TASK_GROUPS = [
  { key: 'ai-learning', label: 'AI Learning', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { key: 'workout', label: 'Workout', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
  { key: 'personal', label: 'Personal Habits', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { key: 'carryover', label: 'Carried-Over Tasks', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
] as const

function groupForTask(task: ScheduledTask): string {
  const title = task.title.toLowerCase()
  if (task.carryoverSourceId) return 'carryover'
  if (
    title.includes('learn') ||
    title.includes('automation') ||
    title.includes('workflow') ||
    title.includes('api') ||
    title.includes('study') ||
    title.includes('read') ||
    title.includes('english')
  )
    return 'ai-learning'
  if (
    title.includes('exercise') ||
    title.includes('workout') ||
    title.includes('run') ||
    title.includes('push') ||
    title.includes('gym')
  )
    return 'workout'
  return 'personal'
}

function cn(...classes: (string | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

function statusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    pending: 'Not done',
    completed: 'Completed',
    partial: 'Partial',
    skipped: 'Skipped',
  }
  return labels[status]
}

function statusVariant(status: TaskStatus): string {
  const variants: Record<TaskStatus, string> = {
    pending: 'default',
    completed: 'success',
    partial: 'warning',
    skipped: 'outline',
  }
  return variants[status]
}

export default function TodayPage() {
  const router = useRouter()
  const { account, isAuthenticated, logout } = useAuth()
  const { toast } = useToast()
  const [selectedDate, setSelectedDate] = React.useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [tasks, setTasks] = React.useState<ScheduledTask[]>([])
  const [loading, setLoading] = React.useState(true)
  const [recoveryModal, setRecoveryModal] = React.useState(false)
  const [recoveryEvaluation, setRecoveryEvaluation] = React.useState<any>(null)
  const [moveDialog, setMoveDialog] = React.useState<{ task: ScheduledTask; targetDate: string } | null>(null)
  const [recoveryLoading, setRecoveryLoading] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [nextDayHabitModal, setNextDayHabitModal] = React.useState(false)
  const [savingNextDayHabit, setSavingNextDayHabit] = React.useState(false)

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadTasks()
  }, [isAuthenticated, selectedDate, router])

  React.useEffect(() => {
    if (!isAuthenticated || selectedDate !== format(new Date(), 'yyyy-MM-dd') || tasks.length === 0) return
    const allComplete = tasks.every((task) => task.status === 'completed')
    if (!allComplete) return
    const key = `dayflow-next-habit-prompt-${selectedDate}`
    if (window.sessionStorage.getItem(key) === 'shown') return
    window.sessionStorage.setItem(key, 'shown')
    setNextDayHabitModal(true)
  }, [isAuthenticated, selectedDate, tasks])

  async function loadTasks() {
    if (!account) return
    setLoading(true)
    try {
      // Habits are definitions; Today displays scheduled-task instances. Materialize
      // active habits for this date before reading the day's task list.
      const [dayTasks, habits] = await Promise.all([
        getScheduledTasksByDate(account.id, selectedDate),
        getHabitsByUser(account.id),
      ])
      const existingHabitIds = new Set(
        dayTasks.filter((task) => task.habitId).map((task) => task.habitId as string),
      )
      const weekday = parseISO(`${selectedDate}T12:00:00`).getDay()
      const allTasks = await getScheduledTasksByUser(account.id)
      const additions: ScheduledTask[] = []

      for (const habit of habits) {
        if (habit.status !== 'active' || existingHabitIds.has(habit.id)) continue
        if (selectedDate < habit.startDate || (habit.endDate && selectedDate > habit.endDate)) continue

        let occurs = false
        if (habit.frequency === 'daily') occurs = true
        else if (habit.frequency === 'weekdays') {
          occurs = habit.selectedWeekdays?.length
            ? habit.selectedWeekdays.includes(weekday)
            : weekday >= 1 && weekday <= 5
        } else if (habit.frequency === 'weekly') {
          occurs = parseISO(`${habit.startDate}T12:00:00`).getDay() === weekday
        } else if (habit.frequency === 'onetime') {
          occurs = selectedDate === habit.startDate
        }
        if (!occurs) continue
        if (allTasks.some((task) => task.habitId === habit.id && task.scheduledDate === selectedDate)) continue

        const now = new Date().toISOString()
        additions.push({
          id: `${account.id}-habit-${habit.id}-${selectedDate}`,
          userId: account.id,
          roadmapTaskId: null,
          habitId: habit.id,
          title: habit.title,
          description: habit.description ?? null,
          trackingType: habit.trackingType,
          targetValue: habit.targetValue ?? null,
          targetUnit: habit.targetUnit ?? null,
          estimatedDuration: habit.trackingType === 'duration' ? habit.targetValue ?? null : null,
          priority: habit.priority,
          scheduledDate: selectedDate,
          originalPlannedDate: selectedDate,
          status: 'pending',
          carryoverSourceId: null,
          dependsOnTaskId: null,
          actualValue: null,
          notes: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
          deletedAt: null,
          version: 1,
        })
      }

      for (const task of additions) await saveScheduledTask(task)
      // Keep soft-deleted occurrences in storage to prevent a recurring habit from
      // being recreated for that same date, but never render them in Today.
      setTasks([...dayTasks.filter((task) => !task.deletedAt), ...additions].sort((a, b) => a.title.localeCompare(b.title)))
    } catch (error) {
      console.error('Failed to load Today tasks:', error)
      toast({ title: 'Could not load tasks', description: 'Please refresh and try again.' })
    } finally {
      setLoading(false)
    }
  }

  async function removeFromThisDay(task: ScheduledTask) {
    if (!window.confirm(`Remove “${task.title}” from ${format(parseISO(selectedDate), 'MMM d, yyyy')} only? This will not remove the original habit or roadmap.`)) return
    try {
      await hideScheduledTaskOccurrence(task)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      toast({ title: 'Removed from this day', description: `${task.title} was hidden for this date only.` })
    } catch (error) {
      console.error('Could not remove task occurrence:', error)
      toast({ title: 'Could not remove task', description: 'Please try again.' })
    }
  }

  async function resetAllMyData() {
    if (!account || resetting) return
    const confirmed = window.confirm('Reset DayFlow for this account? This permanently removes all habits, roadmaps, scheduled tasks, progress, and imported PDF records. Your login account will remain so you can start again. This cannot be undone.')
    if (!confirmed) return
    setResetting(true)
    try {
      await resetUserData(account.id)
      setTasks([])
      setNextDayHabitModal(false)
      toast({ title: 'DayFlow reset', description: 'Your habits and progress were cleared. You can start fresh.' })
    } catch (error) {
      console.error('Could not reset DayFlow data:', error)
      toast({ title: 'Reset failed', description: 'Some data may remain. Please try again.' })
    } finally {
      setResetting(false)
    }
  }

  async function createNextDayHabit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || savingNextDayHabit) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    const trackingType = (String(data.get('trackingType') || 'checkbox')) as TrackingType
    const targetRaw = String(data.get('targetValue') || '').trim()
    const targetValue = targetRaw ? Number(targetRaw) : undefined
    const targetUnit = String(data.get('targetUnit') || '').trim() || undefined
    const frequency = String(data.get('frequency') || 'daily') as Habit['frequency']
    const startDate = schedAddDays(selectedDate, 1)
    const now = new Date().toISOString()
    const habit: Habit = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      userId: account.id,
      title,
      trackingType,
      targetValue: Number.isFinite(targetValue) ? targetValue : undefined,
      targetUnit,
      frequency,
      selectedWeekdays: null,
      startDate,
      endDate: undefined,
      carryoverEnabled: true,
      status: 'active',
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      deletedAt: null,
      version: 1,
    }
    setSavingNextDayHabit(true)
    try {
      await saveHabit(habit)
      setNextDayHabitModal(false)
      toast({ title: 'Habit added for tomorrow', description: `${title} starts ${startDate}.` })
    } catch (error) {
      console.error('Could not create next-day habit:', error)
      toast({ title: 'Could not add habit', description: 'Please try again.' })
    } finally {
      setSavingNextDayHabit(false)
    }
  }

  function prevDay() {
    setSelectedDate(schedAddDays(selectedDate, -1))
  }
  function nextDay() {
    setSelectedDate(schedAddDays(selectedDate, 1))
  }
  function today() {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  }

  const isToday = isSameDay(parseISO(selectedDate), new Date())

  async function markTask(task: ScheduledTask, status: TaskStatus, actualValue?: number) {
    if (!account) return
    const completionPct =
      status === 'completed'
        ? 100
        : status === 'partial'
          ? actualValue && task.targetValue
            ? Math.min(100, Math.round((actualValue / task.targetValue) * 100))
            : 50
          : 0

    const updated: ScheduledTask = {
      ...task,
      status,
      actualValue: actualValue ?? null,
      completedAt: status === 'completed' ? new Date().toISOString() : task.completedAt,
      updatedAt: new Date().toISOString(),
    }
    // Update the screen first so quick repeated taps on a rep counter never get lost.
    setTasks((current) => current.map((t) => (t.id === task.id ? updated : t)))

    try {
      await saveScheduledTask(updated)

      await saveDailyProgress({
        id: `progress-${task.id}`,
        scheduledTaskId: task.id,
        actualValue,
        completionPercentage: completionPct,
        notes: null,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
        version: 1,
      })
    } catch (error) {
      console.error('Could not save task progress:', error)
      toast({ title: 'Could not save', description: 'Please try again.' })
      loadTasks()
      return
    }

    const isCounter = task.trackingType === 'quantity' && (task.targetValue ?? 0) > 1
    if (isCounter && status !== 'completed' && actualValue !== undefined) {
      toast({ title: 'Saved', description: `${task.title}: ${actualValue}/${task.targetValue}${task.targetUnit ? ' ' + task.targetUnit : ''}` })
    } else {
      toast({ title: 'Saved', description: `${task.title} marked as ${statusLabel(status)}.` })
    }
  }

  async function skipTask(task: ScheduledTask) {
    if (!account) return
    const updated: ScheduledTask = { ...task, status: 'skipped', updatedAt: new Date().toISOString() }
    await saveScheduledTask(updated)
    setTasks(tasks.map((t) => (t.id === task.id ? updated : t)))
    toast({ title: 'Skipped', description: `${task.title} marked as skipped.` })
  }

  async function evaluateManualRecovery() {
    if (!account) return
    setRecoveryLoading(true)
    try {
      const res = await fetch('/api/recovery/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.id,
          date: selectedDate,
          tasks: tasks.map((t) => ({
            id: t.id,
            status: t.status,
            carryoverSourceId: t.carryoverSourceId,
            targetValue: t.targetValue,
            actualValue: t.actualValue,
          })),
          alreadyCarriedSourceIds: tasks
            .filter((t) => t.carryoverSourceId)
            .map((t) => t.carryoverSourceId),
        }),
      })
      if (!res.ok) throw new Error('Evaluation failed')
      const data = await res.json()
      setRecoveryEvaluation(data.evaluation)
      setRecoveryModal(true)
    } catch (err) {
      console.error('Recovery evaluation error:', err)
      toast({ title: 'Recovery evaluation failed', description: 'Please try again.' })
    } finally {
      setRecoveryLoading(false)
    }
  }

  async function applyRecovery(carryoverTaskIds: string[]) {
    if (!account) return
    const sourceTasks = tasks.filter((t) => carryoverTaskIds.includes(t.id))
    const targetDate = schedAddDays(selectedDate, 1)

    const allUserTasks = await getScheduledTasksByUser(account.id)
    const workloadCheck = checkWorkload({ targetDate, allTasks: allUserTasks, maxTasksPerDay: 10 })
    if (!workloadCheck.allowed) {
      toast({ title: 'Workload too high', description: workloadCheck.reason })
      return
    }

    try {
      const res = await fetch('/api/recovery/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.id,
          sourceDate: selectedDate,
          targetDate,
          sourceTasks: sourceTasks.map((t) => ({
            id: t.id,
            status: t.status,
            roadmapTaskId: t.roadmapTaskId,
            habitId: t.habitId,
            title: t.title,
            description: t.description,
            trackingType: t.trackingType,
            targetValue: t.targetValue,
            targetUnit: t.targetUnit,
            estimatedDuration: t.estimatedDuration,
            priority: t.priority,
            scheduledDate: t.scheduledDate,
            originalPlannedDate: t.originalPlannedDate,
            carryoverSourceId: t.carryoverSourceId,
          })),
          allTasks: tasks.map((t) => ({
            id: t.id,
            status: t.status,
            title: t.title,
            scheduledDate: t.scheduledDate,
            dependsOnTaskId: undefined,
          })),
          alreadyCarriedSourceIds: tasks
            .filter((t) => t.carryoverSourceId)
            .map((t) => t.carryoverSourceId),
          maxTasksPerDay: 10,
        }),
      })
      if (!res.ok) throw new Error('Apply failed')
      const data = await res.json()

      if (data.ok && data.carryovers.length > 0) {
        for (const c of data.carryovers) {
          await saveScheduledTask(c as ScheduledTask)
        }
        toast({
          title: 'Recovery applied',
          description: `${data.carryovers.length} task(s) carried over to ${targetDate}.`,
        })
        setRecoveryModal(false)
        setRecoveryEvaluation(null)
        loadTasks()
      } else {
        toast({ title: 'No tasks carried over', description: data.reason || 'Nothing to carry over.' })
        setRecoveryModal(false)
      }
    } catch (err) {
      console.error('Recovery apply error:', err)
      toast({ title: 'Recovery failed', description: 'Please try again.' })
    }
  }

  function openMoveDialog(task: ScheduledTask) {
    setMoveDialog({ task, targetDate: schedAddDays(selectedDate, 1) })
  }

  async function confirmMoveTask(task: ScheduledTask, targetDate: string) {
    if (!account) return
    const allUserTasks = await getScheduledTasksByUser(account.id)
    const result = moveTaskToDate({ task, targetDate, allTasks: allUserTasks, maxTasksPerDay: 10 })
    if (!result.ok) {
      toast({ title: 'Cannot move task', description: result.reason })
      setMoveDialog(null)
      return
    }

    try {
      await saveScheduledTask(result.task)
      setTasks(tasks.map((t) => (t.id === task.id ? result.task : t)))
      setMoveDialog(null)
      toast({ title: 'Task moved', description: `${task.title} moved to ${targetDate}.` })
    } catch (err) {
      toast({ title: 'Move failed', description: 'Please try again.' })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="h-10 w-10 rounded-full bg-secondary" />
          <div className="h-4 w-32 rounded bg-secondary" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !account) return null

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const partialCount = tasks.filter((t) => t.status === 'partial').length
  const totalCount = tasks.length
  const completionPct = totalCount === 0 ? 0 : Math.round(((completedCount + partialCount * 0.5) / totalCount) * 100)

  const groups = TASK_GROUPS.map((g) => ({
    ...g,
    items: tasks.filter((t) => groupForTask(t) === g.key),
  }))

  const carryoverTasks = tasks.filter((t) => t.carryoverSourceId)

  return (
    <DashboardShell className="min-h-screen bg-background">
      <nav className="sticky top-0 z-20 border-b border-background bg-background/80 backdrop-blur">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
              D
            </div>
            <span className="font-semibold text-lg tracking-tight">DayFlow</span>
          </div>

          <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-input bg-card text-sm">
            <button onClick={prevDay} className="p-2 hover:bg-accent rounded-md" aria-label="Previous day">
              <Calendar className="h-4 w-4" />
            </button>
            <span className="font-medium px-2">{format(parseISO(selectedDate), 'EEEE, MMM d')}</span>
            <button onClick={nextDay} className="p-2 hover:bg-accent rounded-md" aria-label="Next day">
              <Calendar className="h-4 w-4" />
            </button>
            {!isToday && (
              <Button size="sm" variant="outline" onClick={today}>
                Today
              </Button>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-muted-foreground">Daily completion</div>
              <div className="text-lg font-bold">{completionPct}%</div>
            </div>
            <Button onClick={() => router.push('/plans')} className="hidden sm:flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Habit
            </Button>
            <Button variant="destructive" size="sm" onClick={resetAllMyData} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Reset data'}
            </Button>
            <Button
              variant={completionPct < 50 && totalCount > 0 ? 'destructive' : 'outline'}
              size="sm"
              onClick={evaluateManualRecovery}
              disabled={recoveryLoading}
              aria-label="Review recovery"
            >
              {recoveryLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {completionPct < 50 && totalCount > 0 ? ' Review Recovery' : 'Recovery'}
            </Button>
            <Button variant="outline" size="icon" onClick={logout} aria-label="Sign out">
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex flex-col lg:flex-row gap-4 p-4 lg:p-6">
        <main className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Today</h1>
            <div className="flex gap-2">
              <Badge variant={completionPct >= 50 ? 'success' : 'warning'}>
                {completionPct >= 50 ? 'On track' : 'Below 50% — recovery may trigger'}
              </Badge>
            </div>
          </div>

          {totalCount === 0 ? (
            <Card className="border-dashed">
              <div className="p-10 text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-2">No tasks scheduled for today</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Import a PDF roadmap or add a habit to get started.
                </p>
                <Button onClick={() => router.push('/plans')}>Add Habit</Button>
                <Button variant="outline" onClick={() => router.push('/plans')}>
                  Import PDF
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {groups
                .filter((g) => g.items.length > 0 && g.key !== 'carryover')
                .map((group) => (
                  <Card key={group.key} className="mb-4 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                      <span className={cn(group.color, 'text-xs font-semibold uppercase tracking-wider')}>
                        {group.label}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {group.items.filter((t) => t.status === 'completed').length}/{group.items.length} done
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onMark={markTask}
                          onSkip={skipTask}
                          onMove={openMoveDialog}
                          onDelete={removeFromThisDay}
                        />
                      ))}
                    </div>
                  </Card>
                ))}

              {carryoverTasks.length > 0 && (
                <Card key="carryover" className="mb-4 overflow-hidden border-amber-200 bg-amber-50/50">
                  <div className="flex items-center gap-2 px-4 py-3 bg-amber-100/50 border-b border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                      Carried-Over Tasks
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {carryoverTasks.filter((t) => t.status === 'completed').length}/{carryoverTasks.length} done
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {carryoverTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onMark={markTask}
                        onSkip={skipTask}
                        onMove={openMoveDialog}
                        onDelete={removeFromThisDay}
                        isCarryover
                      />
                    ))}
                  </div>
                  <div className="px-4 py-3 text-xs text-amber-600 bg-amber-50/30 border-t border-amber-200">
                    These tasks were carried over from an unfinished day. Complete them or move them to another date.
                  </div>
                </Card>
              )}
            </>
          )}

          <div className="mt-6 p-4 rounded-xl bg-card border border-border text-sm">
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Total tasks</span>
              <span className="font-medium">{totalCount}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Completed</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{completedCount}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Partial / skipped</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">{partialCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Carried over</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">{carryoverTasks.length}</span>
            </div>
          </div>
        </main>
      </div>

      {nextDayHabitModal && isToday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="next-habit-title">
          <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div>
              <div>
                <h2 id="next-habit-title" className="text-lg font-semibold">100% complete — plan for tomorrow</h2>
                <p className="mt-1 text-sm text-muted-foreground">Great work! Add a habit manually for {schedAddDays(selectedDate, 1)}. It will start tomorrow, not today.</p>
              </div>
            </div>
            <form onSubmit={createNextDayHabit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="next-habit-name" className="text-sm font-medium">Habit name</label>
                <Input id="next-habit-name" name="title" placeholder="e.g. Read for 20 minutes" required autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="next-habit-tracking" className="text-sm font-medium">Tracking type</label>
                  <select id="next-habit-tracking" name="trackingType" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="checkbox">Done / not done</option>
                    <option value="quantity">Quantity</option>
                    <option value="duration">Duration</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="next-habit-frequency" className="text-sm font-medium">Repeat</label>
                  <select id="next-habit-frequency" name="frequency" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="daily">Every day</option>
                    <option value="weekdays">Weekdays</option>
                    <option value="weekly">Weekly</option>
                    <option value="onetime">Tomorrow only</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="next-habit-target" className="text-sm font-medium">Target (optional)</label>
                  <Input id="next-habit-target" name="targetValue" type="number" min="0" step="any" placeholder="20" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="next-habit-unit" className="text-sm font-medium">Unit (optional)</label>
                  <Input id="next-habit-unit" name="targetUnit" placeholder="minutes, pages…" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Start date: {schedAddDays(selectedDate, 1)}</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setNextDayHabitModal(false)}>Not now</Button>
                <Button type="submit" disabled={savingNextDayHabit}>{savingNextDayHabit ? 'Saving…' : 'Add for tomorrow'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {moveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setMoveDialog(null)}>
            <div className="bg-card rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-2">Move task</h2>
              <p className="text-sm text-muted-foreground mb-4">{moveDialog.task.title}</p>
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium">New date</label>
                <Input
                  type="date"
                  value={moveDialog.targetDate}
                  onChange={(e) => setMoveDialog({ ...moveDialog, targetDate: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" size="sm" onClick={() => setMoveDialog(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => confirmMoveTask(moveDialog.task, moveDialog.targetDate)}>
                  Move
                </Button>
              </div>
            </div>
        </div>
      )}

      {recoveryModal && recoveryEvaluation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRecoveryModal(false)}>
            <div className="bg-card rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5" />
                <div>
                  <h2 className="text-lg font-semibold">Recovery Rule Triggered</h2>
                  <p className="text-sm text-muted-foreground">
                    Daily completion was {recoveryEvaluation.completionPercentage}% (below 50%).
                  </p>
                </div>
              </div>
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Eligible tasks</span>
                  <span>{recoveryEvaluation.eligibleTaskCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Completed equivalents</span>
                  <span>{recoveryEvaluation.completedEquivalents}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-muted-foreground">Tasks to carry over</span>
                  <span>{recoveryEvaluation.carriedOverTaskIds.length}</span>
                </div>
              </div>
              {recoveryEvaluation.carriedOverTaskIds.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    The following unfinished tasks will be carried over to{' '}
                    <span className="font-medium">{schedAddDays(selectedDate, 1)}</span>:
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-2 mb-4">
                    {recoveryEvaluation.carriedOverTaskIds.map((id: string) => {
                      const t = tasks.find((x) => x.id === id)
                      return (
                        <div key={id} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50 text-sm">
                          <span className="truncate">{t?.title || id}</span>
                          <Badge variant="secondary" className="text-xs">Carry over</Badge>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setRecoveryModal(false)}>
                  Not now
                </Button>
                <Button
                  size="sm"
                  onClick={() => applyRecovery(recoveryEvaluation.carriedOverTaskIds)}
                  disabled={recoveryLoading}
                >
                  {recoveryLoading ? 'Applying...' : 'Apply recovery'}
                </Button>
              </div>
            </div>
        </div>
      )}
    </DashboardShell>
  )
}

function TaskRow({
  task,
  onMark,
  onSkip,
  onMove,
  onDelete,
  isCarryover = false,
}: {
  task: ScheduledTask
  onMark: (task: ScheduledTask, status: TaskStatus, actualValue?: number) => void
  onSkip: (task: ScheduledTask) => void
  onMove: (task: ScheduledTask) => void
  onDelete: (task: ScheduledTask) => void
  isCarryover?: boolean
}) {
  const [actualValue, setActualValue] = React.useState('')
  const [isPartial, setIsPartial] = React.useState(false)

  const canPartial = task.trackingType !== 'checkbox'

  // Quantity habits with a target above 1 (e.g. "pray 5 times") count one tap at a time.
  const target = task.targetValue ?? 0
  const isCounter = task.trackingType === 'quantity' && target > 1
  const count = isCounter ? (task.status === 'completed' ? target : Math.min(target, task.actualValue ?? 0)) : 0

  function addOne() {
    if (!isCounter || task.status === 'completed') return
    const next = count + 1
    if (next >= target) onMark(task, 'completed', target)
    else onMark(task, 'partial', next)
  }

  function removeOne() {
    if (!isCounter || count <= 0) return
    const prev = count - 1
    if (prev <= 0) onMark(task, 'pending')
    else onMark(task, 'partial', prev)
  }

  const statusColors: Record<TaskStatus, string> = {
    pending: 'text-muted-foreground',
    completed: 'text-emerald-600 dark:text-emerald-400',
    partial: 'text-amber-600 dark:text-amber-400',
    skipped: 'text-muted-foreground line-through',
  }

  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group', isCarryover ? 'bg-amber-50/30' : '')}>
      <div className="flex-1 min-w-0 flex items-center gap-3">
        {isCounter ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={addOne}
              disabled={task.status === 'completed'}
              aria-label={`Add one to ${task.title} (${count} of ${target})`}
              title={task.status === 'completed' ? 'Completed' : 'Tap to add one'}
              className={cn(
                'h-8 min-w-[3.25rem] px-2 rounded-full border-2 flex items-center justify-center gap-1 text-xs font-semibold transition-colors',
                task.status === 'completed'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : count > 0
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                    : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {task.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : null}
              {count}/{target}
            </button>
            <button
              onClick={removeOne}
              disabled={count <= 0}
              aria-label={`Remove one from ${task.title}`}
              title="Undo one"
              className="h-6 w-6 rounded-full border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 flex items-center justify-center"
            >
              <Minus className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              const next = task.status === 'completed' ? 'pending' : 'completed'
              onMark(task, next)
            }}
            className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors"
            style={{ borderColor: task.status === 'completed' ? '#10b981' : 'hsl(var(--border))' }}
          >
            {task.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 fill-emerald-500" />
            ) : null}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{task.title}</span>
            {task.carryoverSourceId && (
              <Badge variant="warning" size="sm" className="ml-1 text-xs">
                Carried over
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            {task.targetValue && task.targetUnit && <span>{isCounter ? `${count} of ${task.targetValue}` : task.targetValue} {task.targetUnit}</span>}
            {task.estimatedDuration && <span>• {task.estimatedDuration} min</span>}
          </div>
          {isPartial && canPartial && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                value={actualValue}
                onChange={(e) => setActualValue(e.target.value)}
                placeholder="Actual"
                className="w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">{task.targetUnit || ''}</span>
              <Button size="sm" onClick={() => {
                const val = parseFloat(actualValue)
                if (isNaN(val)) return
                if (isCounter && val >= target) onMark(task, 'completed', target)
                else onMark(task, 'partial', val)
              }}>
                Save
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(statusColors[task.status], 'text-sm font-medium w-16 text-right')}>
          {task.status === 'completed' ? 'Done' : task.status === 'partial' ? 'Partial' : task.status === 'skipped' ? 'Skipped' : 'Pending'}
        </span>
        {canPartial && !isPartial && (
          <button
            onClick={() => setIsPartial(true)}
            className="text-xs text-primary hover:text-primary/80 underline underline-offset-4"
          >
            Record partial
          </button>
        )}
        <button
          onClick={() => onMove(task)}
          className="text-xs text-primary hover:text-primary/80 underline underline-offset-4"
          aria-label="Move task to another date"
        >
          Move
        </button>
        <button onClick={() => onSkip(task)} className="p-1 text-muted-foreground hover:text-amber-600 rounded-md" aria-label="Skip task" title="Skip task">
          <Minus className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(task)} className="p-1 text-muted-foreground hover:text-destructive rounded-md" aria-label="Remove task from this day" title="Remove from this day">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
