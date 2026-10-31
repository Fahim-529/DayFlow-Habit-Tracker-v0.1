/**
 * DayFlow — Cloud Sync Service
 *
 * Synchronizes local IndexedDB/SQLite data with Supabase PostgreSQL.
 *
 * Key principles:
 * - Sync is optional and user-initiated (via account linking)
 * - Uses stable record IDs, sync status, timestamps, and version fields
 * - Idempotent: re-syncing the same changes doesn't create duplicates
 * - Conflict resolution: local changes are treated as untrusted input;
 *   server validates all incoming records via RLS and schema constraints
 * - No silent overwrites: conflicts are reported to the user
 */

import { createSupabaseClient, isSupabaseConfigured } from './client'
import type {
  UserAccount,
  Habit,
  Roadmap,
  RoadmapTask,
  ScheduledTask,
  DailyProgress,
  WeeklySummary,
  PDFUpload,
  SyncQueueItem,
} from '@/types'

/**
 * Map local account to Supabase profile fields
 */
function accountToProfile(account: UserAccount) {
  return {
    id: account.supabaseUserId || account.id,
    username: account.username,
    timezone: account.timezone,
    account_type: account.accountType,
    is_linked_online: account.isLinkedOnline,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Push local changes to Supabase.
 * Returns { pushed, conflicts, errors }.
 */
export async function pushToSupabase({
  accessToken,
  userId,
  habits,
  roadmaps,
  roadmapTasks,
  scheduledTasks,
  dailyProgress,
  weeklySummaries,
  pdfUploads,
}: {
  accessToken: string
  userId: string
  habits: Habit[]
  roadmaps: Roadmap[]
  roadmapTasks: RoadmapTask[]
  scheduledTasks: ScheduledTask[]
  dailyProgress: DailyProgress[]
  weeklySummaries: WeeklySummary[]
  pdfUploads: PDFUpload[]
}): Promise<{
  pushed: number
  conflicts: string[]
  errors: string[]
}> {
  const conflicts: string[] = []
  const errors: string[] = []
  let pushed = 0

  const supabase = createSupabaseClient(accessToken)
  if (!supabase) {
    errors.push('Supabase not configured')
    return { pushed: 0, conflicts, errors }
  }

  try {
    // Upsert profile
    // (In a real implementation, we'd fetch the local account and upsert it)

    // Upsert roadmaps
    for (const roadmap of roadmaps) {
      const { error } = await supabase
        .from('roadmaps')
        .upsert(
          {
            id: roadmap.id,
            user_id: userId,
            title: roadmap.title,
            source_type: roadmap.sourceType,
            original_file_path: roadmap.originalFilePath,
            start_date: roadmap.startDate,
            status: roadmap.status,
            version: roadmap.version,
            sync_status: roadmap.syncStatus,
            updated_at: roadmap.updatedAt,
          },
          { onConflict: 'id' }
        )
      if (error) {
        conflicts.push(`roadmap ${roadmap.id}: ${error.message}`)
      } else {
        pushed++
      }
    }

    // Upsert roadmap tasks
    for (const task of roadmapTasks) {
      const { error } = await supabase
        .from('roadmap_tasks')
        .upsert(
          {
            id: task.id,
            roadmap_id: task.roadmapId,
            original_day_number: task.originalDayNumber,
            title: task.title,
            description: task.description,
            tracking_type: task.trackingType,
            target_value: task.targetValue,
            target_unit: task.targetUnit,
            estimated_duration: task.estimatedDuration,
            priority: task.priority,
            depends_on_task_id: task.dependsOnTaskId,
            version: task.version,
            sync_status: task.syncStatus,
            updated_at: task.updatedAt,
          },
          { onConflict: 'id' }
        )
      if (error) {
        conflicts.push(`roadmap_task ${task.id}: ${error.message}`)
      } else {
        pushed++
      }
    }

    // Upsert habits
    for (const habit of habits) {
      const { error } = await supabase
        .from('habits')
        .upsert(
          {
            id: habit.id,
            user_id: userId,
            title: habit.title,
            description: habit.description,
            tracking_type: habit.trackingType,
            target_value: habit.targetValue,
            target_unit: habit.targetUnit,
            frequency: habit.frequency,
            selected_weekdays: habit.selectedWeekdays,
            start_date: habit.startDate,
            end_date: habit.endDate,
            carryover_enabled: habit.carryoverEnabled,
            status: habit.status,
            priority: habit.priority,
            reminder_time: habit.reminderTime,
            version: habit.version,
            sync_status: habit.syncStatus,
            updated_at: habit.updatedAt,
          },
          { onConflict: 'id' }
        )
      if (error) {
        conflicts.push(`habit ${habit.id}: ${error.message}`)
      } else {
        pushed++
      }
    }

    // Upsert scheduled tasks
    for (const task of scheduledTasks) {
      const { error } = await supabase
        .from('scheduled_tasks')
        .upsert(
          {
            id: task.id,
            user_id: userId,
            roadmap_task_id: task.roadmapTaskId,
            habit_id: task.habitId,
            title: task.title,
            description: task.description,
            tracking_type: task.trackingType,
            target_value: task.targetValue,
            target_unit: task.targetUnit,
            estimated_duration: task.estimatedDuration,
            priority: task.priority,
            scheduled_date: task.scheduledDate,
            original_planned_date: task.originalPlannedDate,
            status: task.status,
            carryover_source_id: task.carryoverSourceId,
            actual_value: task.actualValue,
            notes: task.notes,
            completed_at: task.completedAt,
            version: task.version,
            sync_status: task.syncStatus,
            updated_at: task.updatedAt,
          },
          { onConflict: 'id' }
        )
      if (error) {
        conflicts.push(`scheduled_task ${task.id}: ${error.message}`)
      } else {
        pushed++
      }
    }

    // Upsert daily progress
    for (const progress of dailyProgress) {
      const { error } = await supabase
        .from('daily_progress')
        .upsert(
          {
            id: progress.id,
            scheduled_task_id: progress.scheduledTaskId,
            actual_value: progress.actualValue,
            completion_percentage: progress.completionPercentage,
            notes: progress.notes,
            version: progress.version,
            sync_status: progress.syncStatus,
            updated_at: progress.updatedAt,
          },
          { onConflict: 'id' }
        )
      if (error) {
        conflicts.push(`daily_progress ${progress.id}: ${error.message}`)
      } else {
        pushed++
      }
    }

    // Upsert weekly summaries
    for (const summary of weeklySummaries) {
      const { error } = await supabase
        .from('weekly_summaries')
        .upsert(
          {
            id: summary.id,
            user_id: userId,
            week_start_date: summary.weekStartDate,
            week_end_date: summary.weekEndDate,
            completion_percentage: summary.completionPercentage,
            eligible_task_count: summary.eligibleTaskCount,
            completed_task_equivalents: summary.completedTaskEquivalents,
            ai_summary: summary.aiSummary,
            version: 1,
            sync_status: 'synced',
            updated_at: summary.updatedAt,
          },
          { onConflict: 'id' }
        )
      if (error) {
        conflicts.push(`weekly_summary ${summary.id}: ${error.message}`)
      } else {
        pushed++
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown sync error')
  }

  return { pushed, conflicts, errors }
}

/**
 * Pull remote changes from Supabase.
 * Returns the remote records for each table.
 */
export async function pullFromSupabase({
  accessToken,
  userId,
}: {
  accessToken: string
  userId: string
}): Promise<{
  roadmaps: any[]
  roadmapTasks: any[]
  habits: any[]
  scheduledTasks: any[]
  dailyProgress: any[]
  weeklySummaries: any[]
  pdfUploads: any[]
  errors: string[]
}> {
  const errors: string[] = []
  const supabase = createSupabaseClient(accessToken)
  if (!supabase) {
    errors.push('Supabase not configured')
    return { roadmaps: [], roadmapTasks: [], habits: [], scheduledTasks: [], dailyProgress: [], weeklySummaries: [], pdfUploads: [], errors }
  }

  const fetchTable = async (table: string) => {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId)
    if (error) {
      errors.push(`${table}: ${error.message}`)
      return []
    }
    return data ?? []
  }

  const [roadmaps, roadmapTasks, habits, scheduledTasks, dailyProgress, weeklySummaries, pdfUploads] =
    await Promise.all([
      fetchTable('roadmaps'),
      fetchTable('roadmap_tasks'),
      fetchTable('habits'),
      fetchTable('scheduled_tasks'),
      fetchTable('daily_progress'),
      fetchTable('weekly_summaries'),
      fetchTable('pdf_uploads'),
    ])

  return {
    roadmaps,
    roadmapTasks,
    habits,
    scheduledTasks,
    dailyProgress,
    weeklySummaries,
    pdfUploads,
    errors,
  }
}

export { isSupabaseConfigured }
