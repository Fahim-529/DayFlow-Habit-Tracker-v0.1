'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3,
  Activity,
  Clock,
  AlertTriangle,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  FileText,
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, eachDayOfInterval, parseISO, isSameDay } from 'date-fns'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import { getWeeklySummariesByUser, getScheduledTasksByUser, saveWeeklySummary } from '@/lib/db'
import type { ScheduledTask } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { computeWeeklyPerformance } from '@/lib/scheduling'

function barColor(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-amber-500'
  if (pct > 0) return 'bg-blue-500'
  return 'bg-border'
}

export default function ProgressPage() {
  const router = useRouter()
  const { account, isAuthenticated, logout } = useAuth()
  const { toast } = useToast()
  const [weekStart, setWeekStart] = React.useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')
  )
  const [tasks, setTasks] = React.useState<ScheduledTask[]>([])
  const [weeklySummaries, setWeeklySummaries] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generatingAI, setGeneratingAI] = React.useState(false)

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
      const [allTasks, summaries] = await Promise.all([
        getScheduledTasksByUser(account.id),
        getWeeklySummariesByUser(account.id),
      ])
      setTasks(allTasks)
      setWeeklySummaries(summaries)
    } finally {
      setLoading(false)
    }
  }

  const weekStartDate = parseISO(weekStart)
  const weekEnd = endOfWeek(weekStartDate, { weekStartsOn: 0 })
  const weekDays = eachDayOfInterval({ start: weekStartDate, end: weekEnd })

  const weekTasks = tasks.filter((t) => {
    const d = parseISO(t.scheduledDate)
    return d >= weekStartDate && d <= weekEnd
  })

  const performance = computeWeeklyPerformance({
    tasks: weekTasks,
    weekStart: format(weekStartDate, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
  })

  const overallPct = performance.overallPercentage
  const completedCount = weekTasks.filter((t) => t.status === 'completed').length
  const partialCount = weekTasks.filter((t) => t.status === 'partial').length

  function prevWeek() {
    setWeekStart((ws) => format(subWeeks(parseISO(ws), 1), 'yyyy-MM-dd'))
  }
  function nextWeek() {
    setWeekStart((ws) => format(addWeeks(parseISO(ws), 1), 'yyyy-MM-dd'))
  }

  const isCurrentWeek = isSameDay(weekStartDate, startOfWeek(new Date(), { weekStartsOn: 0 }))

  // Category breakdown
  const categoryBreakdown = performance.dailyBreakdown && Object.entries(performance.dailyBreakdown).length > 0
    ? {
        'AI Learning': { completed: 0, total: 0 },
        Workout: { completed: 0, total: 0 },
        'Personal Habits': { completed: 0, total: 0 },
      }
    : {
        'AI Learning': { completed: 0, total: 0 },
        Workout: { completed: 0, total: 0 },
        'Personal Habits': { completed: 0, total: 0 },
      }

  weekTasks.forEach((t) => {
    const title = t.title.toLowerCase()
    let category = 'Personal Habits'
    if (
      title.includes('learn') ||
      title.includes('automation') ||
      title.includes('workflow') ||
      title.includes('api') ||
      title.includes('study') ||
      title.includes('read') ||
      title.includes('english')
    ) {
      category = 'AI Learning'
    } else if (
      title.includes('exercise') ||
      title.includes('workout') ||
      title.includes('run') ||
      title.includes('push') ||
      title.includes('gym')
    ) {
      category = 'Workout'
    }
    if (categoryBreakdown[category as keyof typeof categoryBreakdown]) {
      categoryBreakdown[category as keyof typeof categoryBreakdown].total += 1
      if (t.status === 'completed') {
        categoryBreakdown[category as keyof typeof categoryBreakdown].completed += 1
      } else if (t.status === 'partial') {
        categoryBreakdown[category as keyof typeof categoryBreakdown].completed += 0.5
      }
    }
  })

  // Existing AI summary for this week
  const existingSummary = weeklySummaries.find(
    (s) => s.weekStartDate === format(weekStartDate, 'yyyy-MM-dd')
  )

  async function generateAIWeeklySummary() {
    if (!account) return
    setGeneratingAI(true)
    try {
      const res = await fetch('/api/ai/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.id,
          weekStart: format(weekStartDate, 'yyyy-MM-dd'),
          weekEnd: format(weekEnd, 'yyyy-MM-dd'),
          overallPercentage: overallPct,
          completedCount,
          partialCount,
          totalEligible: performance.eligibleCount,
          categoryBreakdown,
          dailyBreakdown: performance.dailyBreakdown,
        }),
      })
      if (!res.ok) throw new Error('Failed to generate summary')
      const data = await res.json()

      // Save the summary locally
      await saveWeeklySummary({
        id: `weekly-${account.id}-${format(weekStartDate, 'yyyy-MM-dd')}`,
        userId: account.id,
        weekStartDate: format(weekStartDate, 'yyyy-MM-dd'),
        weekEndDate: format(weekEnd, 'yyyy-MM-dd'),
        completionPercentage: overallPct,
        eligibleTaskCount: performance.eligibleCount,
        completedTaskEquivalents: performance.completedEquivalents,
        aiSummary: data.summary,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
        version: 1,
      })

      toast({ title: 'Weekly summary generated', description: data.summary })
      loadData()
    } catch (err) {
      console.error('AI summary error:', err)
      toast({ title: 'Summary failed', description: 'AI summary requires an internet connection and AI API key.' })
    } finally {
      setGeneratingAI(false)
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
          <h1 className="text-2xl font-bold">Progress</h1>
          <p className="text-sm text-muted-foreground">Weekly performance and completion trends.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={logout} aria-label="Sign out" />
        </div>
      </div>

      <div className="space-y-6">
        {/* Weekly score card */}
        <Card>
          <div className="flex items-center justify-between p-6">
            <div>
              <h2 className="text-lg font-semibold">Weekly completion</h2>
              <p className="text-sm text-muted-foreground">
                {format(weekStartDate, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{overallPct}%</div>
              <p className="text-sm text-muted-foreground">
                {completedCount} completed, {partialCount} partial of {performance.eligibleCount} planned
              </p>
            </div>
          </div>
          <Progress value={overallPct} className="h-3" />
        </Card>

        {/* Week navigation */}
        <div className="flex items-center justify-between px-4">
          <Button variant="outline" size="sm" onClick={prevWeek} disabled={isCurrentWeek}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setWeekStart(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))
            }
          >
            This week
          </Button>
          <Button variant="outline" size="sm" onClick={nextWeek}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Daily chart */}
        <Card className="grid grid-cols-1 md:grid-cols-7 gap-2 p-4">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground">Daily</span>
            {weekDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const pct = performance.dailyBreakdown[key] ?? 0
              const isToday = isSameDay(day, new Date())
              const color = barColor(pct)
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <span className={isToday ? 'text-xs font-medium text-primary' : 'text-xs font-medium text-muted-foreground'}>
                    {day.getDate()}
                  </span>
                  <div className="w-full h-24 flex flex-col justify-end rounded-t-lg border border-border bg-secondary/50 relative group">
                    <div
                      className={`absolute bottom-0 left-0 w-full rounded-t-lg transition-all duration-300 ${color}`}
                      style={{ height: `${pct}%` }}
                    />
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {pct}%
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{pct}%</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Category breakdown */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Category breakdown</h2>
            <div className="space-y-3">
              {Object.entries(categoryBreakdown).map(([category, stats]) => {
                const catPct = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100)
                return (
                  <div key={category} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <div className="text-sm font-medium">{category}</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.completed} of {stats.total} tasks
                      </div>
                    </div>
                    <Progress value={catPct} className="w-48 h-2" />
                    <span className="text-sm font-medium w-12 text-right">{catPct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        {/* AI Weekly Summary */}
        <Card className="border-amber-200 bg-amber-50/50">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">AI Weekly Summary</h2>
            </div>
            {existingSummary?.aiSummary ? (
              <>
                <div className="prose prose-sm max-w-none text-muted-foreground mb-4">
                  {existingSummary.aiSummary}
                </div>
                <div className="text-xs text-muted-foreground mb-4">
                  Generated {new Date(existingSummary.createdAt).toLocaleDateString()}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground mb-3">
                No AI summary yet for this week. Generate one based on your actual records.
              </div>
            )}
            <div className="flex gap-2">
              {existingSummary?.aiSummary ? (
                <Button variant="outline" size="sm" onClick={generateAIWeeklySummary} disabled={generatingAI}>
                  {generatingAI ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Regenerate
                </Button>
              ) : (
                <Button size="sm" onClick={generateAIWeeklySummary} disabled={generatingAI}>
                  {generatingAI ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generate Summary
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={!existingSummary?.aiSummary || generatingAI}>
                <FileText className="h-3 w-3" /> Export
              </Button>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-muted text-muted-foreground text-xs">
              Summaries are built from your own numbers. To get AI-written summaries, set `AI_API_KEY` and
              `AI_API_URL` (see SETUP.md). Without them you still get a data-based summary.
            </div>
          </div>
        </Card>

        {/* Week summary */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Week summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Completed</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Partial</div>
                <div className="font-bold text-amber-600 dark:text-amber-400">{partialCount}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Planned</div>
                <div className="font-bold">{performance.eligibleCount}</div>
              </div>
            </div>
            {overallPct >= 70 ? (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-sm">
                Strong week! You're staying consistent with your habits.
              </div>
            ) : overallPct >= 40 ? (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 text-sm">
                Some good progress, but there's room to improve next week.
              </div>
            ) : performance.eligibleCount > 0 ? (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 text-rose-800 dark:bg-rose-900/30 text-sm">
                This week was challenging. Consider adjusting your schedule or targets.
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                No tasks planned this week yet.
              </div>
            )}
          </div>
        </Card>

        {/* Historical weeks */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Historical Weeks</h2>
            <div className="space-y-2">
              {weeklySummaries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No historical data yet. Complete some tasks to build your history.</p>
                </div>
              ) : (
                weeklySummaries
                  .slice()
                  .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
                  .map((summary) => {
                    const catPct = summary.completionPercentage
                    return (
                      <div key={summary.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors">
                        <div>
                          <div className="text-sm font-medium">
                            {format(parseISO(summary.weekStartDate), 'MMM d')} —{' '}
                            {format(parseISO(summary.weekEndDate), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {summary.eligibleTaskCount} tasks planned
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{catPct}%</div>
                          <Badge variant={catPct >= 50 ? 'success' : 'warning'} size="sm">
                            {catPct >= 50 ? 'On track' : 'Below 50%'}
                          </Badge>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </Card>
      </div>
    </DashboardShell>
  )
}
