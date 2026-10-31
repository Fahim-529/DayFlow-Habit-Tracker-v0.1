/**
 * Tests for scheduling and recovery logic.
 * These are pure functions that can be tested without IndexedDB.
 */

import { describe, it, expect } from 'vitest'

import {
  addDays,
  parseDate,
  formatDate,
  computeDailyCompletion,
  taskCompletionPercentage,
  evaluateRecovery,
  generateCarryovers,
  moveTaskToDate,
  checkDependencyMove,
  checkWorkload,
  findPotentialDuplicates,
  computeWeeklyPerformance,
} from './scheduling'
import type { ScheduledTask, TaskStatus } from '@/types'

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: overrides.id || 'task-1',
    userId: 'user-1',
    title: overrides.title || 'Test task',
    trackingType: 'checkbox',
    priority: 'medium',
    scheduledDate: overrides.scheduledDate || '2024-01-15',
    originalPlannedDate: overrides.originalPlannedDate || '2024-01-15',
    status: overrides.status || 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncStatus: 'synced',
    version: 1,
    ...overrides,
  }
}

// --- Date helpers ---

describe('Date helpers', () => {
  it('adds days correctly across month boundary', () => {
    expect(addDays('2024-01-28', 5)).toBe('2024-02-02')
  })

  it('adds days correctly across year boundary', () => {
    expect(addDays('2024-12-30', 3)).toBe('2025-01-02')
  })

  it('parseDate and formatDate round-trip', () => {
    const d = parseDate('2024-06-15')
    expect(formatDate(d)).toBe('2024-06-15')
  })
})

// --- Task completion ---

describe('taskCompletionPercentage', () => {
  it('returns 100 for completed', () => {
    expect(taskCompletionPercentage('completed')).toBe(100)
  })

  it('returns 0 for skipped', () => {
    expect(taskCompletionPercentage('skipped')).toBe(0)
  })

  it('returns 50 for partial without values', () => {
    expect(taskCompletionPercentage('partial')).toBe(50)
  })

  it('computes partial percentage for quantity', () => {
    expect(taskCompletionPercentage('partial', 10, 20)).toBe(50)
  })

  it('caps quantity at 100%', () => {
    expect(taskCompletionPercentage('partial', 30, 20)).toBe(100)
  })

  it('returns 0 for pending', () => {
    expect(taskCompletionPercentage('pending')).toBe(0)
  })
})

// --- computeDailyCompletion ---

describe('computeDailyCompletion', () => {
  it('computes 100% when all checkbox tasks completed', () => {
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'completed' }),
    ]
    const result = computeDailyCompletion(tasks)
    expect(result.percentage).toBe(100)
    expect(result.eligible).toBe(2)
    expect(result.completedEquivalents).toBe(2)
  })

  it('computes 50% for one partial quantity task', () => {
    const tasks = [
      makeTask({ status: 'partial', targetValue: 20, actualValue: 10 }),
    ]
    const result = computeDailyCompletion(tasks)
    expect(result.percentage).toBe(50)
    expect(result.completedEquivalents).toBe(0.5)
  })

  it('returns 0 for empty list', () => {
    const result = computeDailyCompletion([])
    expect(result.percentage).toBe(0)
    expect(result.eligible).toBe(0)
  })

  it('mixes completed and partial', () => {
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'partial', targetValue: 20, actualValue: 10 }),
      makeTask({ status: 'pending' }),
    ]
    const result = computeDailyCompletion(tasks)
    // 1.0 + 0.5 + 0 = 1.5 / 3 = 50%
    expect(result.percentage).toBe(50)
  })
})

// --- evaluateRecovery ---

describe('evaluateRecovery', () => {
  it('triggers when completion is below 50%', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'pending' }),
      makeTask({ id: 't2', status: 'pending' }),
    ]
    const result = evaluateRecovery({ tasks, date: '2024-01-15' })
    expect(result.triggered).toBe(true)
    expect(result.completionPercentage).toBe(0)
    expect(result.carriedOverTaskIds).toEqual(['t1', 't2'])
  })

  it('does not trigger at exactly 50%', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed' }),
      makeTask({ id: 't2', status: 'pending' }),
    ]
    const result = evaluateRecovery({ tasks, date: '2024-01-15' })
    // 1.0 + 0 = 1.0 / 2 = 50%
    expect(result.triggered).toBe(false)
    expect(result.carriedOverTaskIds).toEqual([])
  })

  it('does not trigger above 50%', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed' }),
      makeTask({ id: 't2', status: 'partial', targetValue: 20, actualValue: 15 }),
    ]
    // 1.0 + 0.75 = 1.75 / 2 = 87.5% → 88%
    const result = evaluateRecovery({ tasks, date: '2024-01-15' })
    expect(result.triggered).toBe(false)
  })

  it('never carries over completed tasks', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed' }),
      makeTask({ id: 't2', status: 'pending' }),
      makeTask({ id: 't3', status: 'pending' }),
    ]
    const result = evaluateRecovery({ tasks, date: '2024-01-15' })
    // 1.0 + 0 + 0 = 1.0 / 3 = 33% → triggers recovery
    expect(result.triggered).toBe(true)
    // Only t2 (pending) is carried over, not t1 (completed)
    expect(result.carriedOverTaskIds).toEqual(['t2', 't3'])
  })

  it('skips already-carried-over tasks (idempotency)', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'pending', carryoverSourceId: 'original-1' }),
    ]
    const result = evaluateRecovery({
      tasks,
      date: '2024-01-15',
      alreadyCarriedSourceIds: new Set(['t1']),
    })
    expect(result.carriedOverTaskIds).toEqual([])
  })

  it('returns empty when no eligible tasks', () => {
    const result = evaluateRecovery({ tasks: [], date: '2024-01-15' })
    expect(result.triggered).toBe(false)
    expect(result.eligibleTaskCount).toBe(0)
  })
})

// --- generateCarryovers ---

describe('generateCarryovers', () => {
  it('creates carryover tasks for unfinished source tasks', () => {
    const sourceTasks = [
      makeTask({ id: 't1', status: 'pending', scheduledDate: '2024-01-15' }),
      makeTask({ id: 't2', status: 'completed', scheduledDate: '2024-01-15' }),
    ]
    const result = generateCarryovers({
      sourceTasks,
      sourceDate: '2024-01-15',
      targetDate: '2024-01-16',
      alreadyCarriedSourceIds: new Set(),
      userId: 'user-1',
    })
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('Test task')
    expect(result[0].scheduledDate).toBe('2024-01-16')
    expect(result[0].carryoverSourceId).toBe('t1')
    expect(result[0].originalPlannedDate).toBe('2024-01-15')
    expect(result[0].status).toBe('pending')
  })

  it('does not duplicate already-carried tasks', () => {
    const sourceTasks = [
      makeTask({ id: 't1', status: 'pending', scheduledDate: '2024-01-15' }),
    ]
    const result = generateCarryovers({
      sourceTasks,
      sourceDate: '2024-01-15',
      targetDate: '2024-01-16',
      alreadyCarriedSourceIds: new Set(['t1']),
      userId: 'user-1',
    })
    expect(result.length).toBe(0)
  })

  it('preserves original planned date', () => {
    const sourceTasks = [
      makeTask({
        id: 't1',
        status: 'pending',
        scheduledDate: '2024-01-15',
        originalPlannedDate: '2024-01-10',
      }),
    ]
    const result = generateCarryovers({
      sourceTasks,
      sourceDate: '2024-01-15',
      targetDate: '2024-01-16',
      alreadyCarriedSourceIds: new Set(),
      userId: 'user-1',
    })
    expect(result[0].originalPlannedDate).toBe('2024-01-10')
  })
})

// --- moveTaskToDate ---

describe('moveTaskToDate', () => {
  it('moves a pending task to a new date', () => {
    const task = makeTask({ id: 't1', status: 'pending', scheduledDate: '2024-01-15' })
    const allTasks = [task]
    const result = moveTaskToDate({ task, targetDate: '2024-01-16', allTasks })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.task.scheduledDate).toBe('2024-01-16')
      expect(result.task.version).toBe(2)
    }
  })

  it('refuses to move a completed task', () => {
    const task = makeTask({ id: 't1', status: 'completed', scheduledDate: '2024-01-15' })
    const allTasks = [task]
    const result = moveTaskToDate({ task, targetDate: '2024-01-16', allTasks })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('completed')
    }
  })

  it('preserves originalPlannedDate when moving', () => {
    const task = makeTask({
      id: 't1',
      status: 'pending',
      scheduledDate: '2024-01-15',
      originalPlannedDate: '2024-01-10',
    })
    const allTasks = [task]
    const result = moveTaskToDate({ task, targetDate: '2024-01-16', allTasks })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.task.originalPlannedDate).toBe('2024-01-10')
    }
  })
})

// --- checkDependencyMove ---

describe('checkDependencyMove', () => {
  it('allows move when no dependency', () => {
    const task = makeTask({ id: 't1', scheduledDate: '2024-01-15' })
    const result = checkDependencyMove({ task, targetDate: '2024-01-16', allTasks: [task] })
    expect(result.allowed).toBe(true)
  })

  it('blocks move when dependency is scheduled after target date', () => {
    const dependency = makeTask({ id: 'dep-1', title: 'Dependency task', scheduledDate: '2024-01-20' })
    const task = makeTask({
      id: 't1',
      title: 'Dependent task',
      scheduledDate: '2024-01-15',
      dependsOnTaskId: 'dep-1',
    })
    const result = checkDependencyMove({
      task,
      targetDate: '2024-01-15',
      allTasks: [dependency, task],
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('depends on')
  })

  it('allows move when dependency is scheduled before target date', () => {
    const dependency = makeTask({ id: 'dep-1', scheduledDate: '2024-01-10' })
    const task = makeTask({
      id: 't1',
      scheduledDate: '2024-01-15',
      dependsOnTaskId: 'dep-1',
    })
    const result = checkDependencyMove({
      task,
      targetDate: '2024-01-16',
      allTasks: [dependency, task],
    })
    expect(result.allowed).toBe(true)
  })
})

// --- checkWorkload ---

describe('checkWorkload', () => {
  it('allows move when under limit', () => {
    const tasks = [makeTask({ id: 't1', scheduledDate: '2024-01-16' })]
    const result = checkWorkload({
      targetDate: '2024-01-16',
      allTasks: tasks,
      maxTasksPerDay: 10,
      excludingTaskId: 't1',
    })
    expect(result.allowed).toBe(true)
    expect(result.currentLoad).toBe(0)
  })

  it('blocks move when at limit', () => {
    const tasks = [
      makeTask({ id: 't1', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't2', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't3', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't4', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't5', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't6', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't7', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't8', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't9', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't10', scheduledDate: '2024-01-16' }),
    ]
    const result = checkWorkload({
      targetDate: '2024-01-16',
      allTasks: tasks,
      maxTasksPerDay: 10,
      excludingTaskId: 't11', // a new task being moved in
    })
    expect(result.allowed).toBe(false)
    expect(result.currentLoad).toBe(10)
  })
})

// --- findPotentialDuplicates ---

describe('findPotentialDuplicates', () => {
  it('finds duplicate title on same date', () => {
    const existing = [
      makeTask({ id: 't1', title: 'Read book', scheduledDate: '2024-01-15' }),
      makeTask({ id: 't2', title: 'Read book', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't3', title: 'Different task', scheduledDate: '2024-01-15' }),
    ]
    const candidate = makeTask({
      id: 't99',
      title: 'Read book',
      scheduledDate: '2024-01-15',
    })
    const dupes = findPotentialDuplicates({ candidate, existingTasks: existing })
    expect(dupes.length).toBe(1)
    expect(dupes[0].id).toBe('t1')
  })

  it('excludes the candidate itself', () => {
    const existing = [
      makeTask({ id: 't1', title: 'Read book', scheduledDate: '2024-01-15' }),
    ]
    const candidate = makeTask({ id: 't1', title: 'Read book', scheduledDate: '2024-01-15' })
    const dupes = findPotentialDuplicates({ candidate, existingTasks: existing })
    expect(dupes.length).toBe(0)
  })
})

// --- computeWeeklyPerformance ---

describe('computeWeeklyPerformance', () => {
  it('computes weekly percentage from tasks', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed', scheduledDate: '2024-01-15' }),
      makeTask({ id: 't2', status: 'pending', scheduledDate: '2024-01-16' }),
      makeTask({ id: 't3', status: 'completed', scheduledDate: '2024-01-17' }),
    ]
    const result = computeWeeklyPerformance({
      tasks,
      weekStart: '2024-01-15',
      weekEnd: '2024-01-21',
    })
    // 2 completed / 3 total = 67%
    expect(result.overallPercentage).toBe(67)
    expect(result.eligibleCount).toBe(3)
  })

  it('excludes tasks outside the week', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed', scheduledDate: '2024-01-10' }),
      makeTask({ id: 't2', status: 'pending', scheduledDate: '2024-01-15' }),
    ]
    const result = computeWeeklyPerformance({
      tasks,
      weekStart: '2024-01-15',
      weekEnd: '2024-01-21',
    })
    expect(result.eligibleCount).toBe(1)
  })

  it('returns zero for empty week', () => {
    const result = computeWeeklyPerformance({
      tasks: [],
      weekStart: '2024-01-15',
      weekEnd: '2024-01-21',
    })
    expect(result.overallPercentage).toBe(0)
    expect(result.eligibleCount).toBe(0)
  })
})
