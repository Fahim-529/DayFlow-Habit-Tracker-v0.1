export type TrackingType = 'checkbox' | 'quantity' | 'duration'

export type FrequencyType = 'daily' | 'weekdays' | 'weekly' | 'onetime'

export type HabitStatus = 'active' | 'paused' | 'archived'

export type RoadmapStatus = 'draft' | 'active' | 'paused' | 'archived'

export type TaskStatus = 'pending' | 'completed' | 'partial' | 'skipped'

export type AccountType = 'local' | 'online'

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error'

export interface UserAccount {
  id: string
  username: string
  accountType: AccountType
  timezone: string
  createdAt: string
  updatedAt: string
  isLinkedOnline: boolean
  supabaseUserId?: string | null
  /** bcrypt hash. Stored in the local database only; never kept in app state or localStorage. */
  passwordHash?: string
}

export interface Habit {
  id: string
  userId: string
  title: string
  description?: string | null
  trackingType: TrackingType
  targetValue?: number | null
  targetUnit?: string | null
  frequency: FrequencyType
  selectedWeekdays?: number[] | null // 0=Sunday ... 6=Saturday
  startDate: string // YYYY-MM-DD
  endDate?: string | null
  carryoverEnabled: boolean
  status: HabitStatus
  priority: 'low' | 'medium' | 'high'
  reminderTime?: string | null // HH:MM
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  deletedAt?: string | null
  version: number
}

export interface Roadmap {
  id: string
  userId: string
  title: string
  sourceType: 'pdf' | 'manual'
  originalFilePath?: string | null
  startDate: string
  status: RoadmapStatus
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  deletedAt?: string | null
  version: number
}

export interface RoadmapTask {
  id: string
  roadmapId: string
  originalDayNumber: number
  title: string
  description?: string | null
  trackingType: TrackingType
  targetValue?: number | null
  targetUnit?: string | null
  estimatedDuration?: number | null // minutes
  priority: 'low' | 'medium' | 'high'
  dependsOnTaskId?: string | null
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  deletedAt?: string | null
  version: number
}

export interface ScheduledTask {
  id: string
  userId: string
  roadmapTaskId?: string | null
  habitId?: string | null
  title: string
  description?: string | null
  trackingType: TrackingType
  targetValue?: number | null
  targetUnit?: string | null
  estimatedDuration?: number | null
  priority: 'low' | 'medium' | 'high'
  scheduledDate: string // YYYY-MM-DD
  originalPlannedDate: string // YYYY-MM-DD
  status: TaskStatus
  carryoverSourceId?: string | null
  dependsOnTaskId?: string | null
  actualValue?: number | null
  notes?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  deletedAt?: string | null
  version: number
}

export interface DailyProgress {
  id: string
  scheduledTaskId: string
  actualValue?: number | null
  completionPercentage: number
  notes?: string | null
  updatedAt: string
  syncStatus: SyncStatus
  version: number
}

export interface WeeklySummary {
  id: string
  userId: string
  weekStartDate: string
  weekEndDate: string
  completionPercentage: number
  eligibleTaskCount: number
  completedTaskEquivalents: number
  aiSummary?: string | null
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  version: number
}

export interface PDFUpload {
  id: string
  userId: string
  originalFileName: string
  localFilePath: string
  fileSize: number
  mimeType: string
  extractedText?: string | null
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed'
  extractionError?: string | null
  roadmapId?: string | null
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
}

export interface SyncQueueItem {
  id: string
  tableName: string
  recordId: string
  operation: 'insert' | 'update' | 'delete'
  payload: unknown
  createdAt: string
  attempts: number
  lastError?: string | null
}

export interface AppTheme {
  theme: 'light' | 'dark' | 'system'
}

export interface RecoveryEvaluation {
  date: string
  completionPercentage: number
  eligibleTaskCount: number
  completedEquivalents: number
  triggered: boolean
  carriedOverTaskIds: string[]
}

export interface WeeklyPerformance {
  weekStart: string
  weekEnd: string
  overallPercentage: number
  eligibleCount: number
  completedEquivalents: number
  categoryBreakdown: Record<string, { completed: number; total: number }>
  dailyBreakdown: Record<string, number>
}

export interface ExtractedTask {
  id: string
  originalDayNumber: number
  title: string
  description?: string | null
  trackingType: 'checkbox' | 'quantity' | 'duration'
  targetValue?: number | null
  targetUnit?: string | null
  estimatedDuration?: number | null
  priority: 'low' | 'medium' | 'high'
  dependsOnTaskId?: string | null
  confidence: 'high' | 'medium' | 'low'
  edited?: boolean
}

export interface PDFImportResult {
  tasks: ExtractedTask[]
  aiUsed: boolean
  totalTasks: number
  extractionMethod: 'ai' | 'deterministic-fallback'
  note: string
}
