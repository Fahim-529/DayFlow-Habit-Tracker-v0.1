-- DayFlow — PostgreSQL Schema (Supabase)
--
-- This schema mirrors the IndexedDB/local schema for cloud-synced records.
-- All user-owned tables have Row Level Security (RLS) enabled with policies
-- that restrict access to the record's owner (auth.uid()).
--
-- Run this in your Supabase SQL editor to set up the database.

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- Profiles
-- ============================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  timezone text not null default 'UTC',
  account_type text not null default 'online',
  is_linked_online boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- ============================================
-- Roadmaps
-- ============================================
create table if not exists roadmaps (
  id text primary key default uuid_generate_v4()::text,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  source_type text not null check (source_type in ('pdf', 'manual')),
  original_file_path text,
  start_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error'))
);

alter table roadmaps enable row level security;

create policy "Users can view their own roadmaps"
  on roadmaps for select
  using (auth.uid() = user_id);

create policy "Users can insert their own roadmaps"
  on roadmaps for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own roadmaps"
  on roadmaps for update
  using (auth.uid() = user_id);

create policy "Users can delete their own roadmaps"
  on roadmaps for delete
  using (auth.uid() = user_id);

create index if not exists idx_roadmaps_user_id on roadmaps(user_id);
create index if not exists idx_roadmaps_status on roadmaps(status);

-- ============================================
-- Roadmap Tasks
-- ============================================
create table if not exists roadmap_tasks (
  id text primary key default uuid_generate_v4()::text,
  roadmap_id text references roadmaps(id) on delete cascade not null,
  original_day_number integer not null,
  title text not null,
  description text,
  tracking_type text not null check (tracking_type in ('checkbox', 'quantity', 'duration')),
  target_value numeric,
  target_unit text,
  estimated_duration integer,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  depends_on_task_id text references roadmap_tasks(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error'))
);

alter table roadmap_tasks enable row level security;

create policy "Users can view their own roadmap tasks"
  on roadmap_tasks for select
  using (
    exists (select 1 from roadmaps where id = roadmap_id and user_id = auth.uid())
  );

create policy "Users can insert their own roadmap tasks"
  on roadmap_tasks for insert
  with check (
    exists (select 1 from roadmaps where id = roadmap_id and user_id = auth.uid())
  );

create policy "Users can update their own roadmap tasks"
  on roadmap_tasks for update
  using (
    exists (select 1 from roadmaps where id = roadmap_id and user_id = auth.uid())
  );

create policy "Users can delete their own roadmap tasks"
  on roadmap_tasks for delete
  using (
    exists (select 1 from roadmaps where id = roadmap_id and user_id = auth.uid())
  );

create index if not exists idx_roadmap_tasks_roadmap_id on roadmap_tasks(roadmap_id);

-- ============================================
-- Habits
-- ============================================
create table if not exists habits (
  id text primary key default uuid_generate_v4()::text,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  tracking_type text not null check (tracking_type in ('checkbox', 'quantity', 'duration')),
  target_value numeric,
  target_unit text,
  frequency text not null check (frequency in ('daily', 'weekdays', 'weekly', 'onetime')),
  selected_weekdays integer[],
  start_date date not null,
  end_date date,
  carryover_enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  reminder_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error'))
);

alter table habits enable row level security;

create policy "Users can view their own habits"
  on habits for select
  using (auth.uid() = user_id);

create policy "Users can insert their own habits"
  on habits for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own habits"
  on habits for update
  using (auth.uid() = user_id);

create policy "Users can delete their own habits"
  on habits for delete
  using (auth.uid() = user_id);

create index if not exists idx_habits_user_id on habits(user_id);
create index if not exists idx_habits_status on habits(status);

-- ============================================
-- Scheduled Tasks
-- ============================================
create table if not exists scheduled_tasks (
  id text primary key default uuid_generate_v4()::text,
  user_id uuid references auth.users(id) on delete cascade not null,
  roadmap_task_id text references roadmap_tasks(id),
  habit_id text references habits(id),
  title text not null,
  description text,
  tracking_type text not null check (tracking_type in ('checkbox', 'quantity', 'duration')),
  target_value numeric,
  target_unit text,
  estimated_duration integer,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  scheduled_date date not null,
  original_planned_date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'partial', 'skipped')),
  carryover_source_id text,
  actual_value numeric,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error'))
);

alter table scheduled_tasks enable row level security;

create policy "Users can view their own scheduled tasks"
  on scheduled_tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own scheduled tasks"
  on scheduled_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own scheduled tasks"
  on scheduled_tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own scheduled tasks"
  on scheduled_tasks for delete
  using (auth.uid() = user_id);

create index if not exists idx_scheduled_tasks_user_id on scheduled_tasks(user_id);
create index if not exists idx_scheduled_tasks_date on scheduled_tasks(scheduled_date);
create index if not exists idx_scheduled_tasks_habit_id on scheduled_tasks(habit_id);

-- ============================================
-- Daily Progress
-- ============================================
create table if not exists daily_progress (
  id text primary key default uuid_generate_v4()::text,
  scheduled_task_id text references scheduled_tasks(id) on delete cascade not null,
  actual_value numeric,
  completion_percentage integer not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error')),
  version integer not null default 1
);

alter table daily_progress enable row level security;

create policy "Users can view their own daily progress"
  on daily_progress for select
  using (
    exists (select 1 from scheduled_tasks where id = scheduled_task_id and user_id = auth.uid())
  );

create policy "Users can insert their own daily progress"
  on daily_progress for insert
  with check (
    exists (select 1 from scheduled_tasks where id = scheduled_task_id and user_id = auth.uid())
  );

create policy "Users can update their own daily progress"
  on daily_progress for update
  using (
    exists (select 1 from scheduled_tasks where id = scheduled_task_id and user_id = auth.uid())
  );

create index if not exists idx_daily_progress_task_id on daily_progress(scheduled_task_id);

-- ============================================
-- Weekly Summaries
-- ============================================
create table if not exists weekly_summaries (
  id text primary key default uuid_generate_v4()::text,
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start_date date not null,
  week_end_date date not null,
  completion_percentage integer not null default 0,
  eligible_task_count integer not null default 0,
  completed_task_equivalents numeric not null default 0,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error'))
);

alter table weekly_summaries enable row level security;

create policy "Users can view their own weekly summaries"
  on weekly_summaries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own weekly summaries"
  on weekly_summaries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own weekly summaries"
  on weekly_summaries for update
  using (auth.uid() = user_id);

create index if not exists idx_weekly_summaries_user_id on weekly_summaries(user_id);
create index if not exists idx_weekly_summaries_week on weekly_summaries(week_start_date);

-- ============================================
-- PDF Uploads
-- ============================================
create table if not exists pdf_uploads (
  id text primary key default uuid_generate_v4()::text,
  user_id uuid references auth.users(id) on delete cascade not null,
  original_file_name text not null,
  local_file_path text not null,
  file_size bigint not null,
  mime_type text not null,
  extracted_text text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extraction_error text,
  roadmap_id text references roadmaps(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error'))
);

alter table pdf_uploads enable row level security;

create policy "Users can view their own pdf uploads"
  on pdf_uploads for select
  using (auth.uid() = user_id);

create policy "Users can insert their own pdf uploads"
  on pdf_uploads for insert
  with check (auth.uid() = user_id);

create index if not exists idx_pdf_uploads_user_id on pdf_uploads(user_id);

-- ============================================
-- Sync Queue (for conflict resolution)
-- ============================================
create table if not exists sync_queue (
  id text primary key default uuid_generate_v4()::text,
  user_id uuid references auth.users(id) on delete cascade not null,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);

alter table sync_queue enable row level security;

create policy "Users can view their own sync queue"
  on sync_queue for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sync queue"
  on sync_queue for insert
  with check (auth.uid() = user_id);

create index if not exists idx_sync_queue_user_id on sync_queue(user_id);

-- ============================================
-- Helper: updated_at trigger function
-- ============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language 'plpgsql';

-- Apply updated_at triggers (only tables that have an updated_at column)
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','roadmaps','roadmap_tasks','habits','scheduled_tasks',
    'daily_progress','weekly_summaries','pdf_uploads'
  ] loop
    execute format('drop trigger if exists update_%I_updated_at on %I', t, t);
    execute format(
      'create trigger update_%I_updated_at before update on %I for each row execute function update_updated_at_column()',
      t, t
    );
  end loop;
end $$;

-- ============================================
-- Security fixes: policies that were missing
-- (required so users can fully delete their own cloud data, and so
--  UPDATE policies also check the new row, not just the old one)
-- ============================================
create policy "Users can delete their own profile"
  on profiles for delete using (auth.uid() = id);

create policy "Users can delete their own daily progress"
  on daily_progress for delete
  using (
    exists (select 1 from scheduled_tasks where id = scheduled_task_id and user_id = auth.uid())
  );

create policy "Users can delete their own weekly summaries"
  on weekly_summaries for delete using (auth.uid() = user_id);

create policy "Users can update their own pdf uploads"
  on pdf_uploads for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own pdf uploads"
  on pdf_uploads for delete using (auth.uid() = user_id);

create policy "Users can update their own sync queue"
  on sync_queue for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own sync queue"
  on sync_queue for delete using (auth.uid() = user_id);
