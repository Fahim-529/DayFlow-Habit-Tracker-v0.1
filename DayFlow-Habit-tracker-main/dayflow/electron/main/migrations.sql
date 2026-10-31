-- DayFlow — SQLite Database Schema (REFERENCE ONLY — not used by the app; data lives in IndexedDB)
--
-- This is the local SQLite schema for the Electron desktop app.
-- It mirrors the IndexedDB schema (web/PWA) and the PostgreSQL schema (Supabase).
--
-- The database file is stored in the OS app-data directory:
--   Windows: %APPDATA%\DayFlow\db\dayflow.db
--   (NOT in the installation directory)
--
-- Schema version: 1

-- Accounts (local/offline user accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'local',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_linked_online INTEGER NOT NULL DEFAULT 0,
  supabase_user_id TEXT,
  password_hash TEXT
);

-- Roadmaps (PDF-imported or manually created)
CREATE TABLE IF NOT EXISTS roadmaps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('pdf', 'manual')),
  original_file_path TEXT,
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error'))
);

-- Roadmap tasks (tasks within a PDF-imported roadmap)
CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  original_day_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tracking_type TEXT NOT NULL CHECK (tracking_type IN ('checkbox', 'quantity', 'duration')),
  target_value REAL,
  target_unit TEXT,
  estimated_duration INTEGER,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  depends_on_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error'))
);

-- Habits (manually created tracking items)
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tracking_type TEXT NOT NULL CHECK (tracking_type IN ('checkbox', 'quantity', 'duration')),
  target_value REAL,
  target_unit TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekdays', 'weekly', 'onetime')),
  selected_weekdays TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  carryover_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  reminder_time TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error'))
);

-- Scheduled tasks (tasks on specific calendar dates)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  roadmap_task_id TEXT,
  habit_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  tracking_type TEXT NOT NULL CHECK (tracking_type IN ('checkbox', 'quantity', 'duration')),
  target_value REAL,
  target_unit TEXT,
  estimated_duration INTEGER,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  scheduled_date TEXT NOT NULL,
  original_planned_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'partial', 'skipped')),
  carryover_source_id TEXT,
  depends_on_task_id TEXT,
  actual_value REAL,
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error'))
);

-- Daily progress (completion per task)
CREATE TABLE IF NOT EXISTS daily_progress (
  id TEXT PRIMARY KEY,
  scheduled_task_id TEXT NOT NULL,
  actual_value REAL,
  completion_percentage INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error')),
  version INTEGER NOT NULL DEFAULT 1
);

-- Weekly summaries (performance per week)
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start_date TEXT NOT NULL,
  week_end_date TEXT NOT NULL,
  completion_percentage INTEGER NOT NULL DEFAULT 0,
  eligible_task_count INTEGER NOT NULL DEFAULT 0,
  completed_task_equivalents REAL NOT NULL DEFAULT 0,
  ai_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error'))
);

-- PDF uploads (imported roadmap documents)
CREATE TABLE IF NOT EXISTS pdf_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  local_file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  extracted_text TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_error TEXT,
  roadmap_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error'))
);

-- Sync queue (pending cloud sync operations)
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_roadmaps_user_id ON roadmaps(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user_id ON scheduled_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_date ON scheduled_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_habit_id ON scheduled_tasks(habit_id);
CREATE INDEX IF NOT EXISTS idx_daily_progress_task_id ON daily_progress(scheduled_task_id);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_week ON weekly_summaries(week_start_date);
CREATE INDEX IF NOT EXISTS idx_pdf_uploads_user_id ON pdf_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_id ON sync_queue(table_name);
