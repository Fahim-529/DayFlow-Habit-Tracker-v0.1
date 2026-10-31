/**
 * DayFlow — Shared Scheduling & Recovery Business Logic
 *
 * These are pure functions shared by both the web/PWA (IndexedDB) and the
 * Windows desktop (SQLite) versions. They contain no framework or database
 * dependencies, so the same rules run identically on every platform.
 *
 * Covered by automated tests in src/lib/scheduling.test.ts and
 * src/lib/recovery.test.ts.
 */

import type {
  ScheduledTask,
  TaskStatus,
  TrackingType,
  RecoveryEvaluation,
} from '@/types'

/** Add N days to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Parse a YYYY-MM-DD string into a Date at UTC midnight. */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z')
}

/** Format a Date as YYYY-MM-DD. */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Get the start of the local day for a date string. */
export function startOfLocalDay(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

/** Check if a date is a weekend (Saturday=6, Sunday=0). */
export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  return day === 0 || day === 6
}

/** Check if a date is in the provided rest days list. */
export function isRestDay(dateStr: string, restDays: string[]): boolean {
  return restDays.includes(dateStr)
}

/**
 * Compute the completion percentage for a single measurable task.
 * Capped at 100%.
 */
export function taskCompletionPercentage(
  status: TaskStatus,
  actualValue?: number | null,
  targetValue?: number | null
): number {
  if (status === 'completed') return 100
  if (status === 'skipped') return 0
  if (status === 'partial') {
    if (actualValue !== null && actualValue !== undefined && targetValue && targetValue > 0) {
      return Math.min(100, Math.max(0, Math.round((actualValue / targetValue) * 100)))
    }
    return 50
  }
  return 0
}

/**
 * Compute daily completion for a list of scheduled tasks.
 * Returns the percentage, eligible count, and completed equivalents.
 * Rest days and tasks not scheduled for the day are excluded by the caller.
 */
export function computeDailyCompletion(tasks: ScheduledTask[]): {
  percentage: number
  eligible: number
  completedEquivalents: number
} {
  const eligible = tasks.length
  if (eligible === 0) return { percentage: 0, eligible: 0, completedEquivalents: 0 }

  let completedEquivalents = 0
  for (const t of tasks) {
    const pct = taskCompletionPercentage(t.status, t.actualValue, t.targetValue)
    completedEquivalents += pct / 100
  }

  return {
    percentage: Math.round((completedEquivalents / eligible) * 100),
    eligible,
    completedEquivalents,
  }
}

/**
 * Evaluate the 50% recovery rule for a given date.
 *
 * Returns an evaluation object indicating whether the rule triggered,
 * which tasks should be carried over, and the completion stats.
 *
 * Rules:
 * - Only incomplete (pending/partial/skipped) tasks with carryoverEnabled
 *   are candidates.
 * - Completed tasks are never carried over.
 * - Tasks with carryoverEnabled === false are excluded.
 * - Already-carried-over tasks (carryoverSourceId set) are not duplicated.
 */
export function evaluateRecovery({
  tasks,
  date,
  alreadyCarriedSourceIds = new Set<string>(),
  carryoverEnabledByTaskId = new Map<string, boolean>(),
}: {
  tasks: ScheduledTask[]
  date: string
  alreadyCarriedSourceIds?: Set<string>
  carryoverEnabledByTaskId?: Map<string, boolean>
}): RecoveryEvaluation {
  // All tasks scheduled for this date are eligible for the completion calc.
  // Completed tasks count as 1.0 equivalents; incomplete as 0 or partial.
  const { percentage, completedEquivalents } = computeDailyCompletion(tasks)

  // Only incomplete tasks are candidates for carryover.
  const incomplete = tasks.filter((t) => t.status !== 'completed')

  const triggered = percentage < 50 && tasks.length > 0

  const carriedOverTaskIds: string[] = []
  if (triggered) {
    for (const t of incomplete) {
      if (alreadyCarriedSourceIds.has(t.id)) continue
      if (carryoverEnabledByTaskId.has(t.id) && carryoverEnabledByTaskId.get(t.id) === false)
        continue
      carriedOverTaskIds.push(t.id)
    }
  }

  return {
    date,
    completionPercentage: percentage,
    eligibleTaskCount: tasks.length,
    completedEquivalents,
    triggered,
    carriedOverTaskIds,
  }
}

/**
 * Generate carryover tasks for unfinished tasks from a source date to a
 * target date.
 *
 * Idempotent: if a carryover already exists (carryoverSourceId set), it
 * is not duplicated.
 *
 * Returns the new scheduled tasks to insert.
 */
export function generateCarryovers({
  sourceTasks,
  sourceDate,
  targetDate,
  alreadyCarriedSourceIds,
  userId,
}: {
  sourceTasks: ScheduledTask[]
  sourceDate: string
  targetDate: string
  alreadyCarriedSourceIds: Set<string>
  userId: string
}): ScheduledTask[] {
  const now = new Date().toISOString()
  const carryovers: ScheduledTask[] = []

  for (const source of sourceTasks) {
    if (source.status === 'completed') continue
    if (alreadyCarriedSourceIds.has(source.id)) continue

    carryovers.push({
      id: `${userId}-carryover-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      userId,
      roadmapTaskId: source.roadmapTaskId ?? null,
      habitId: source.habitId ?? null,
      title: source.title,
      description: source.description,
      trackingType: source.trackingType,
      targetValue: source.targetValue,
      targetUnit: source.targetUnit,
      estimatedDuration: source.estimatedDuration,
      priority: source.priority,
      scheduledDate: targetDate,
      originalPlannedDate: source.originalPlannedDate,
      status: 'pending',
      carryoverSourceId: source.id,
      actualValue: null,
      notes: `Carried over from ${sourceDate}`,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      deletedAt: null,
      version: 1,
    })
  }

  return carryovers
}

/**
 * Check whether moving a task to a target date would violate dependencies.
 *
 * A task that dependsOnTaskId cannot be scheduled before its dependency.
 * Returns an object with `allowed` and a `reason` if not allowed.
 */
export function checkDependencyMove({
  task,
  targetDate,
  allTasks,
}: {
  task: ScheduledTask
  targetDate: string
  allTasks: ScheduledTask[]
}): { allowed: boolean; reason?: string } {
  if (!task.dependsOnTaskId) return { allowed: true }

  const dependency = allTasks.find((t) => t.id === task.dependsOnTaskId)
  if (!dependency) return { allowed: true } // dependency not found, allow

  // The dependency must be scheduled on or before the target date
  if (dependency.scheduledDate > targetDate) {
    return {
      allowed: false,
      reason: `Cannot move "${task.title}" to ${targetDate} — it depends on "${dependency.title}" which is scheduled for ${dependency.scheduledDate}.`,
    }
  }

  return { allowed: true }
}

/**
 * Check whether a target date would create an excessive workload.
 *
 * Returns { allowed, reason, currentLoad } where currentLoad is the count
 * of tasks already scheduled for the target date.
 */
export function checkWorkload({
  targetDate,
  allTasks,
  maxTasksPerDay = 10,
  excludingTaskId = null,
}: {
  targetDate: string
  allTasks: ScheduledTask[]
  maxTasksPerDay?: number
  excludingTaskId?: string | null
}): { allowed: boolean; reason?: string; currentLoad: number } {
  const load = allTasks.filter(
    (t) => t.scheduledDate === targetDate && t.id !== excludingTaskId && t.status !== 'completed'
  ).length

  if (load >= maxTasksPerDay) {
    return {
      allowed: false,
      reason: `${targetDate} already has ${load} tasks (max ${maxTasksPerDay}). Choose a lighter day.`,
      currentLoad: load,
    }
  }

  return { allowed: true, currentLoad: load }
}

/**
 * Move a task to a new date, validating dependencies and workload.
 *
 * Returns the updated task if allowed, or an error reason if not.
 */
export function moveTaskToDate({
  task,
  targetDate,
  allTasks,
  maxTasksPerDay = 10,
}: {
  task: ScheduledTask
  targetDate: string
  allTasks: ScheduledTask[]
  maxTasksPerDay?: number
}): { ok: true; task: ScheduledTask } | { ok: false; reason: string } {
  // Don't move completed tasks
  if (task.status === 'completed') {
    return { ok: false, reason: 'Cannot move a completed task.' }
  }

  const depCheck = checkDependencyMove({ task, targetDate, allTasks })
  if (!depCheck.allowed) return { ok: false, reason: depCheck.reason ?? 'Dependency conflict.' }

  const workloadCheck = checkWorkload({
    targetDate,
    allTasks,
    maxTasksPerDay,
    excludingTaskId: task.id,
  })
  if (!workloadCheck.allowed) return { ok: false, reason: workloadCheck.reason ?? 'Workload too high.' }

  const now = new Date().toISOString()
  const updated: ScheduledTask = {
    ...task,
    scheduledDate: targetDate,
    updatedAt: now,
    version: (task.version || 0) + 1,
  }

  return { ok: true, task: updated }
}

/**
 * Detect potential duplicates when importing or recovering.
 *
 * A task is considered a potential duplicate if another task for the same
 * user has the same title and scheduled date.
 */
export function findPotentialDuplicates({
  candidate,
  existingTasks,
}: {
  candidate: ScheduledTask
  existingTasks: ScheduledTask[]
}): ScheduledTask[] {
  return existingTasks.filter(
    (t) =>
      t.id !== candidate.id &&
      t.title.toLowerCase() === candidate.title.toLowerCase() &&
      t.scheduledDate === candidate.scheduledDate
  )
}

/**
 * Compute weekly performance from scheduled tasks.
 */
export function computeWeeklyPerformance({
  tasks,
  weekStart,
  weekEnd,
}: {
  tasks: ScheduledTask[]
  weekStart: string
  weekEnd: string
}): {
  overallPercentage: number
  eligibleCount: number
  completedEquivalents: number
  dailyBreakdown: Record<string, number>
} {
  const start = parseDate(weekStart)
  const end = parseDate(weekEnd)

  const weekTasks = tasks.filter((t) => {
    const d = parseDate(t.scheduledDate)
    return d >= start && d <= end
  })

  const { percentage, completedEquivalents } = computeDailyCompletion(weekTasks)

  // Daily breakdown
  const dailyBreakdown: Record<string, number> = {}
  const days = []
  let cur = new Date(start)
  while (cur <= end) {
    days.push(formatDate(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  for (const day of days) {
    const dayTasks = weekTasks.filter((t) => t.scheduledDate === day)
    const { percentage: pct } = computeDailyCompletion(dayTasks)
    dailyBreakdown[day] = dayTasks.length === 0 ? 0 : pct
  }

  return {
    overallPercentage: percentage,
    eligibleCount: weekTasks.length,
    completedEquivalents,
    dailyBreakdown,
  }
}
