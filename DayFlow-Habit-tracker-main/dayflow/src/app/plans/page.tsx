'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText,
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
  Pause,
  Play,
  Archive,
  Edit3,
  AlertTriangle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import {
  getHabitsByUser,
  saveHabit,
  deleteHabit,
  getRoadmapsByUser,
  saveRoadmap,
  getScheduledTasksByUser,
  saveScheduledTask,
} from '@/lib/db'
import type { Habit, Roadmap, HabitStatus, RoadmapStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DashboardShell } from '@/components/layout/dashboard-shell'

const STATUS_LABELS: Record<HabitStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}

const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}

export default function PlansPage() {
  const router = useRouter()
  const { account, isAuthenticated, logout } = useAuth()
  const { toast } = useToast()
  const [habits, setHabits] = React.useState<Habit[]>([])
  const [roadmaps, setRoadmaps] = React.useState<Roadmap[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addHabitOpen, setAddHabitOpen] = React.useState(false)
  const [editingHabit, setEditingHabit] = React.useState<Habit | null>(null)

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadData()
  }, [isAuthenticated, router])

  async function loadData() {
    if (!account) return
    setLoading(true)
    try {
      const [hs, rs] = await Promise.all([getHabitsByUser(account.id), getRoadmapsByUser(account.id)])
      setHabits(hs.filter((h) => h.status !== 'archived'))
      setRoadmaps(rs.filter((r) => r.status !== 'archived'))
    } finally {
      setLoading(false)
    }
  }

  async function createHabit(e: React.FormEvent) {
    e.preventDefault()
    if (!account) return
    const form = e.currentTarget as HTMLFormElement
    const formData = new FormData(form)
    const title = formData.get('title') as string
    const trackingType = (formData.get('trackingType') as 'checkbox' | 'quantity' | 'duration') || 'checkbox'
    const targetRaw = String(formData.get('targetValue') || '').trim()
    const targetValue = targetRaw && Number.isFinite(Number(targetRaw)) ? Number(targetRaw) : undefined
    const targetUnit = (formData.get('targetUnit') as string) || undefined
    const frequency = (formData.get('frequency') as Habit['frequency']) || 'daily'
    const startDate = (formData.get('startDate') as string) || format(new Date(), 'yyyy-MM-dd')

    if (!title.trim()) {
      toast({ title: 'Missing name', description: 'Please enter a habit name.' })
      return
    }

    // ---- Edit an existing habit ----
    if (editingHabit) {
      const updated: Habit = {
        ...editingHabit,
        title: title.trim(),
        trackingType,
        targetValue: targetValue ?? null,
        targetUnit: targetUnit ?? null,
        frequency,
        startDate,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
        version: (editingHabit.version || 0) + 1,
      }
      try {
        await saveHabit(updated)

        // Keep today's / upcoming copies of this habit in sync so the change shows on Today.
        // Finished or skipped days and past days are left untouched (history stays accurate).
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const scheduled = await getScheduledTasksByUser(account.id)
        for (const task of scheduled) {
          if (task.habitId !== updated.id) continue
          if (task.deletedAt || task.scheduledDate < todayStr) continue
          if (task.status === 'completed' || task.status === 'skipped') continue
          const targetChanged = (task.targetValue ?? null) !== (updated.targetValue ?? null)
          await saveScheduledTask({
            ...task,
            title: updated.title,
            trackingType: updated.trackingType,
            targetValue: updated.targetValue ?? null,
            targetUnit: updated.targetUnit ?? null,
            estimatedDuration: updated.trackingType === 'duration' ? updated.targetValue ?? null : null,
            // a changed target makes an old partial count meaningless, so start that day again
            ...(targetChanged || task.trackingType !== updated.trackingType
              ? { status: 'pending' as const, actualValue: null }
              : {}),
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending',
          })
        }

        setHabits((current) => current.map((h) => (h.id === updated.id ? updated : h)))
        setEditingHabit(null)
        toast({ title: 'Habit updated', description: `${updated.title} was saved.` })
      } catch (err) {
        console.error('Update habit failed:', err)
        toast({ title: 'Failed', description: 'Could not update habit. Please try again.' })
      }
      return
    }

    // ---- Create a new habit ----
    const now = new Date().toISOString()
    const habit: Habit = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      userId: account.id,
      title: title.trim(),
      description: undefined,
      trackingType,
      targetValue,
      targetUnit,
      frequency,
      selectedWeekdays: null,
      startDate,
      endDate: undefined,
      carryoverEnabled: true,
      status: 'active',
      priority: 'medium',
      reminderTime: undefined,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      deletedAt: null,
      version: 1,
    }

    try {
      await saveHabit(habit)
      setHabits([...habits, habit])
      setAddHabitOpen(false)
      ;form.reset()
      toast({ title: 'Habit created', description: `${title} is now tracked.` })
    } catch (err) {
      toast({ title: 'Failed', description: 'Could not save habit. Please try again.' })
    }
  }

  async function toggleHabitStatus(habit: Habit, newStatus: HabitStatus) {
    if (!account) return
    const updated: Habit = { ...habit, status: newStatus, updatedAt: new Date().toISOString(), version: (habit.version || 0) + 1 }
    await saveHabit(updated)
    setHabits(habits.map((h) => (h.id === habit.id ? updated : h)))
    toast({ title: `Habit ${newStatus}`, description: updated.title })
  }

  async function removeHabit(habit: Habit) {
    if (!account) return
    const confirmed = window.confirm(`Permanently delete “${habit.title}”? Its scheduled copies and progress for this habit will also be removed. This cannot be undone.`)
    if (!confirmed) return
    try {
      await deleteHabit(habit.id)
      setHabits((current) => current.filter((item) => item.id !== habit.id))
      toast({ title: 'Habit deleted', description: `“${habit.title}” was removed.` })
    } catch (error) {
      console.error('Delete habit failed:', error)
      toast({ title: 'Could not delete habit', description: 'Please try again.' })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
      </div>
    )
  }

  if (!isAuthenticated || !account) return null

  return (
    <DashboardShell className="min-h-screen bg-background p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Plans</h1>
          <p className="text-sm text-muted-foreground">Your habits and roadmaps in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={logout} aria-label="Sign out" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="col-span-full lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Habits</h2>
            <Button size="sm" onClick={() => { setEditingHabit(null); setAddHabitOpen(true) }}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {(addHabitOpen || editingHabit) && (
            <Card className="mb-4">
              <form key={editingHabit?.id ?? 'new'} onSubmit={createHabit} className="p-4 space-y-4">
                {editingHabit && <h3 className="text-base font-semibold">Edit habit</h3>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Habit name</label>
                    <Input name="title" placeholder="e.g. Read for 20 minutes" defaultValue={editingHabit?.title ?? ''} required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Tracking type</label>
                    <select name="trackingType" defaultValue={editingHabit?.trackingType ?? 'checkbox'} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="checkbox">Checkbox</option>
                      <option value="quantity">Quantity (tap once per rep)</option>
                      <option value="duration">Duration</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Target value</label>
                    <Input type="number" name="targetValue" min="0" step="any" placeholder="e.g. 5" defaultValue={editingHabit?.targetValue ?? ''} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Unit</label>
                    <Input name="targetUnit" placeholder="e.g. times, sets" defaultValue={editingHabit?.targetUnit ?? ''} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Frequency</label>
                    <select name="frequency" defaultValue={editingHabit?.frequency ?? 'daily'} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="daily">Every day</option>
                      <option value="weekdays">Selected weekdays</option>
                      <option value="weekly">Weekly</option>
                      <option value="onetime">One-time</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Start date</label>
                  <Input type="date" name="startDate" defaultValue={editingHabit?.startDate ?? format(new Date(), 'yyyy-MM-dd')} required />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit">{editingHabit ? 'Save changes' : 'Create habit'}</Button>
                  <Button type="button" variant="outline" onClick={() => { setAddHabitOpen(false); setEditingHabit(null) }}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-3">
            {habits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No habits yet. Add your first habit above.</p>
              </div>
            ) : (
              habits.map((habit) => (
                <Card key={habit.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{habit.title}</span>
                      <Badge variant={habit.status === 'active' ? 'default' : 'outline'}>
                        {STATUS_LABELS[habit.status]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {habit.trackingType}{habit.targetValue ? ` (${habit.targetValue}${habit.targetUnit ? ' ' + habit.targetUnit : ''})` : ''} • {habit.frequency} • starts {format(parseISO(habit.startDate), 'MMM d')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {habit.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => toggleHabitStatus(habit, 'paused')}>
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => toggleHabitStatus(habit, 'active')}>
                        <Play className="h-3 w-3" /> Resume
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setAddHabitOpen(false); setEditingHabit(habit); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label={`Edit ${habit.title}`} title="Edit habit">
                      <Edit3 className="h-3 w-3" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleHabitStatus(habit, 'archived')} aria-label={`Archive ${habit.title}`} title="Archive habit">
                      <Archive className="h-3 w-3" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => removeHabit(habit)} aria-label={`Delete ${habit.title}`} title="Delete habit">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Roadmaps</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" asChild>
                <a href="/plans/import">
                  <Plus className="h-3 w-3" /> Import PDF
                </a>
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {roadmaps.length === 0 ? (
              <Card className="border-dashed py-8">
                <div className="text-center">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-1">No roadmaps yet</h3>
                  <p className="text-sm text-muted-foreground">Import a PDF to create a roadmap.</p>
                </div>
              </Card>
            ) : (
              roadmaps.map((roadmap) => (
                <Card key={roadmap.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{roadmap.title}</span>
                      <Badge variant={roadmap.sourceType === 'pdf' ? 'secondary' : 'default'} className="text-xs">
                        {roadmap.sourceType === 'pdf' ? 'PDF' : 'Manual'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Starts {format(parseISO(roadmap.startDate), 'MMM d')} • {ROADMAP_STATUS_LABELS[roadmap.status]}
                    </div>
                  </div>
                  <Link href={`/plans/${roadmap.id}`}>
                    <Button size="sm" variant="outline">View</Button>
                  </Link>
                </Card>
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
