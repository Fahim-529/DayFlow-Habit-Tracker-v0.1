/**
 * IndexedDB wrapper for the web/PWA version of DayFlow.
 * Provides a Promise-based API over IndexedDB with account-scoped stores.
 *
 * Stores:
 *  - accounts
 *  - habits
 *  - roadmaps
 *  - roadmapTasks
 *  - scheduledTasks
 *  - dailyProgress
 *  - weeklySummaries
 *  - pdfUploads
 *  - syncQueue
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'
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
  AccountType,
} from '@/types'

const DB_NAME = 'dayflow'
const DB_VERSION = 1

export interface DayFlowDB extends DBSchema {
  accounts: {
    key: string
    value: UserAccount
    indexes: { 'by-username': string }
  }
  habits: {
    key: string
    value: Habit
    indexes: { 'by-user': string; 'by-status': string }
  }
  roadmaps: {
    key: string
    value: Roadmap
    indexes: { 'by-user': string; 'by-status': string }
  }
  roadmapTasks: {
    key: string
    value: RoadmapTask
    indexes: { 'by-roadmap': string }
  }
  scheduledTasks: {
    key: string
    value: ScheduledTask
    indexes: { 'by-user': string; 'by-date': string; 'by-habit': string }
  }
  dailyProgress: {
    key: string
    value: DailyProgress
    indexes: { 'by-task': string }
  }
  weeklySummaries: {
    key: string
    value: WeeklySummary
    indexes: { 'by-user': string; 'by-week': string }
  }
  pdfUploads: {
    key: string
    value: PDFUpload
    indexes: { 'by-user': string }
  }
  syncQueue: {
    key: string
    value: SyncQueueItem
    indexes: {}
  }
}

let dbInstance: IDBPDatabase<DayFlowDB> | null = null

export async function getDB(): Promise<IDBPDatabase<DayFlowDB>> {
  if (dbInstance) return dbInstance
  dbInstance = await openDB<DayFlowDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('accounts')) {
        const store = db.createObjectStore('accounts', { keyPath: 'id' })
        store.createIndex('by-username', 'username', { unique: true })
      }
      if (!db.objectStoreNames.contains('habits')) {
        const store = db.createObjectStore('habits', { keyPath: 'id' })
        store.createIndex('by-user', 'userId')
        store.createIndex('by-status', 'status')
      }
      if (!db.objectStoreNames.contains('roadmaps')) {
        const store = db.createObjectStore('roadmaps', { keyPath: 'id' })
        store.createIndex('by-user', 'userId')
        store.createIndex('by-status', 'status')
      }
      if (!db.objectStoreNames.contains('roadmapTasks')) {
        const store = db.createObjectStore('roadmapTasks', { keyPath: 'id' })
        store.createIndex('by-roadmap', 'roadmapId')
      }
      if (!db.objectStoreNames.contains('scheduledTasks')) {
        const store = db.createObjectStore('scheduledTasks', { keyPath: 'id' })
        store.createIndex('by-user', 'userId')
        store.createIndex('by-date', 'scheduledDate')
        store.createIndex('by-habit', 'habitId')
      }
      if (!db.objectStoreNames.contains('dailyProgress')) {
        const store = db.createObjectStore('dailyProgress', { keyPath: 'id' })
        store.createIndex('by-task', 'scheduledTaskId')
      }
      if (!db.objectStoreNames.contains('weeklySummaries')) {
        const store = db.createObjectStore('weeklySummaries', { keyPath: 'id' })
        store.createIndex('by-user', 'userId')
        store.createIndex('by-week', 'weekStartDate')
      }
      if (!db.objectStoreNames.contains('pdfUploads')) {
        const store = db.createObjectStore('pdfUploads', { keyPath: 'id' })
        store.createIndex('by-user', 'userId')
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
      }
    },
    blocked() {
      console.warn('IndexedDB upgrade blocked - close other tabs using DayFlow')
    },
  })
  return dbInstance
}

// ---------- Generic helpers ----------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

// ---------- Accounts ----------

export async function getAccount(id: string): Promise<UserAccount | null> {
  const db = await getDB()
  const val = await db.get('accounts', id)
  return val ?? null
}

export async function getAccountByUsername(username: string): Promise<UserAccount | null> {
  const db = await getDB()
  const tx = db.transaction('accounts', 'readonly')
  const idx = tx.store.index('by-username')
  const val = await idx.get(username)
  return val ?? null
}

export async function saveAccount(account: UserAccount): Promise<void> {
  const db = await getDB()
  await db.put('accounts', account)
}

// ---------- Habits ----------

export async function getHabitsByUser(userId: string): Promise<Habit[]> {
  const db = await getDB()
  const tx = db.transaction('habits', 'readonly')
  const idx = tx.store.index('by-user')
  return idx.getAll(userId)
}

export async function getHabit(id: string): Promise<Habit | null> {
  const db = await getDB()
  const val = await db.get('habits', id)
  return val ?? null
}

export async function saveHabit(habit: Habit): Promise<void> {
  const db = await getDB()
  await db.put('habits', habit)
}

export async function deleteHabit(id: string): Promise<void> {
  const db = await getDB()
  // Remove all scheduled instances and progress records linked to this habit,
  // otherwise deleted habits can continue appearing on Today.
  const tx = db.transaction(['habits', 'scheduledTasks', 'dailyProgress'], 'readwrite')
  const scheduledStore = tx.objectStore('scheduledTasks')
  const linkedTasks = await scheduledStore.index('by-habit').getAll(id)
  const progressStore = tx.objectStore('dailyProgress')
  for (const task of linkedTasks) {
    const progress = await progressStore.index('by-task').get(task.id)
    if (progress) await progressStore.delete(progress.id)
    await scheduledStore.delete(task.id)
  }
  await tx.objectStore('habits').delete(id)
  await tx.done
}

// ---------- Roadmaps ----------

export async function getRoadmapsByUser(userId: string): Promise<Roadmap[]> {
  const db = await getDB()
  const tx = db.transaction('roadmaps', 'readonly')
  const idx = tx.store.index('by-user')
  return idx.getAll(userId)
}

export async function getRoadmap(id: string): Promise<Roadmap | null> {
  const db = await getDB()
  const val = await db.get('roadmaps', id)
  return val ?? null
}

export async function saveRoadmap(roadmap: Roadmap): Promise<void> {
  const db = await getDB()
  await db.put('roadmaps', roadmap)
}

export async function deleteRoadmap(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('roadmaps', id)
}

// ---------- Roadmap Tasks ----------

export async function getRoadmapTasks(roadmapId: string): Promise<RoadmapTask[]> {
  const db = await getDB()
  const tx = db.transaction('roadmapTasks', 'readonly')
  const idx = tx.store.index('by-roadmap')
  return idx.getAll(roadmapId)
}

export async function saveRoadmapTask(task: RoadmapTask): Promise<void> {
  const db = await getDB()
  await db.put('roadmapTasks', task)
}

export async function deleteRoadmapTask(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('roadmapTasks', id)
}

// ---------- Scheduled Tasks ----------

export async function getScheduledTasksByUser(userId: string): Promise<ScheduledTask[]> {
  const db = await getDB()
  const tx = db.transaction('scheduledTasks', 'readonly')
  const idx = tx.store.index('by-user')
  return idx.getAll(userId)
}

export async function getScheduledTasksByDate(userId: string, date: string): Promise<ScheduledTask[]> {
  const db = await getDB()
  const tx = db.transaction('scheduledTasks', 'readonly')
  const idx = tx.store.index('by-date')
  // scheduledDate is stored as YYYY-MM-DD, so an exact match is what we need.
  const all = await idx.getAll(date)
  return all.filter((t) => t.userId === userId)
}

export async function getScheduledTask(id: string): Promise<ScheduledTask | null> {
  const db = await getDB()
  const val = await db.get('scheduledTasks', id)
  return val ?? null
}

export async function saveScheduledTask(task: ScheduledTask): Promise<void> {
  const db = await getDB()
  await db.put('scheduledTasks', task)
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('scheduledTasks', id)
}


/** Soft-delete a single scheduled occurrence without deleting its recurring habit. */
export async function hideScheduledTaskOccurrence(task: ScheduledTask): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['scheduledTasks', 'dailyProgress'], 'readwrite')
  await tx.objectStore('scheduledTasks').put({
    ...task,
    deletedAt: nowISO(),
    updatedAt: nowISO(),
  })
  const progressKeys = await tx.objectStore('dailyProgress').index('by-task').getAllKeys(task.id)
  for (const key of progressKeys) await tx.objectStore('dailyProgress').delete(key)
  await tx.done
}

/** Reset one user's plans and progress while preserving their local login account. */
export async function resetUserData(userId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(
    ['habits', 'roadmaps', 'roadmapTasks', 'scheduledTasks', 'dailyProgress', 'weeklySummaries', 'pdfUploads', 'syncQueue'],
    'readwrite',
  )
  const ownedRecordIds = new Set<string>()
  const habits = tx.objectStore('habits')
  for (const key of await habits.index('by-user').getAllKeys(userId)) {
    ownedRecordIds.add(String(key))
    await habits.delete(key)
  }

  const roadmapsStore = tx.objectStore('roadmaps')
  const roadmaps = await roadmapsStore.index('by-user').getAll(userId)
  const roadmapTasksStore = tx.objectStore('roadmapTasks')
  for (const roadmap of roadmaps) {
    ownedRecordIds.add(roadmap.id)
    for (const key of await roadmapTasksStore.index('by-roadmap').getAllKeys(roadmap.id)) {
      ownedRecordIds.add(String(key))
      await roadmapTasksStore.delete(key)
    }
    await roadmapsStore.delete(roadmap.id)
  }

  const scheduledStore = tx.objectStore('scheduledTasks')
  const scheduledTasks = await scheduledStore.index('by-user').getAll(userId)
  const progressStore = tx.objectStore('dailyProgress')
  for (const task of scheduledTasks) {
    ownedRecordIds.add(task.id)
    for (const key of await progressStore.index('by-task').getAllKeys(task.id)) {
      ownedRecordIds.add(String(key))
      await progressStore.delete(key)
    }
    await scheduledStore.delete(task.id)
  }

  const summaries = tx.objectStore('weeklySummaries')
  for (const key of await summaries.index('by-user').getAllKeys(userId)) {
    ownedRecordIds.add(String(key))
    await summaries.delete(key)
  }
  const uploads = tx.objectStore('pdfUploads')
  for (const key of await uploads.index('by-user').getAllKeys(userId)) {
    ownedRecordIds.add(String(key))
    await uploads.delete(key)
  }
  const syncQueue = tx.objectStore('syncQueue')
  for (const item of await syncQueue.getAll()) {
    if (ownedRecordIds.has(item.recordId)) await syncQueue.delete(item.id)
  }
  await tx.done
}

// ---------- Daily Progress ----------

export async function getDailyProgress(taskId: string): Promise<DailyProgress | null> {
  const db = await getDB()
  const tx = db.transaction('dailyProgress', 'readonly')
  const idx = tx.store.index('by-task')
  const val = await idx.get(taskId)
  return val ?? null
}

export async function saveDailyProgress(progress: DailyProgress): Promise<void> {
  const db = await getDB()
  await db.put('dailyProgress', progress)
}

// ---------- Weekly Summaries ----------

export async function getWeeklySummariesByUser(userId: string): Promise<WeeklySummary[]> {
  const db = await getDB()
  const tx = db.transaction('weeklySummaries', 'readonly')
  const idx = tx.store.index('by-user')
  return idx.getAll(userId)
}

export async function saveWeeklySummary(summary: WeeklySummary): Promise<void> {
  const db = await getDB()
  await db.put('weeklySummaries', summary)
}

// ---------- PDF Uploads ----------

export async function getPDFUploadsByUser(userId: string): Promise<PDFUpload[]> {
  const db = await getDB()
  const tx = db.transaction('pdfUploads', 'readonly')
  const idx = tx.store.index('by-user')
  return idx.getAll(userId)
}

export async function savePDFUpload(upload: PDFUpload): Promise<void> {
  const db = await getDB()
  await db.put('pdfUploads', upload)
}

// ---------- Sync Queue ----------

export async function enqueueSync(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  const db = await getDB()
  await db.add('syncQueue', {
    ...item,
    createdAt: nowISO(),
    attempts: 0,
  } as SyncQueueItem)
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB()
  return db.getAll('syncQueue')
}

export async function removeSyncItem(key: string | number): Promise<void> {
  const db = await getDB()
  await db.delete('syncQueue', key as unknown as string)
}

export async function updateSyncItem(key: string | number, patch: Partial<SyncQueueItem>): Promise<void> {
  const db = await getDB()
  const item = await db.get('syncQueue', key as unknown as string)
  if (item) await db.put('syncQueue', { ...item, ...patch })
}


// ---------- Export / delete all data for one user ----------

/** Everything that belongs to a user, as plain JSON (password hash excluded). */
export async function exportUserData(userId: string) {
  const db = await getDB()
  const account = await db.get('accounts', userId)
  const habits = await db.getAllFromIndex('habits', 'by-user', userId)
  const roadmaps = await db.getAllFromIndex('roadmaps', 'by-user', userId)
  const scheduledTasks = await db.getAllFromIndex('scheduledTasks', 'by-user', userId)
  const weeklySummaries = await db.getAllFromIndex('weeklySummaries', 'by-user', userId)
  const pdfUploads = await db.getAllFromIndex('pdfUploads', 'by-user', userId)

  const roadmapTasks = (
    await Promise.all(roadmaps.map((r) => db.getAllFromIndex('roadmapTasks', 'by-roadmap', r.id)))
  ).flat()
  const dailyProgress = (
    await Promise.all(scheduledTasks.map((t) => db.getAllFromIndex('dailyProgress', 'by-task', t.id)))
  ).flat()

  let safeAccount: Omit<UserAccount, 'passwordHash'> | null = null
  if (account) {
    const { passwordHash: _omit, ...rest } = account
    safeAccount = rest
  }

  return {
    exportedAt: nowISO(),
    account: safeAccount,
    habits,
    roadmaps,
    roadmapTasks,
    scheduledTasks,
    dailyProgress,
    weeklySummaries,
    pdfUploads,
  }
}

/** Permanently deletes ALL local data for one user, including the account itself. */
export async function deleteAllUserData(userId: string): Promise<void> {
  const db = await getDB()
  const roadmaps = await db.getAllFromIndex('roadmaps', 'by-user', userId)
  const scheduledTasks = await db.getAllFromIndex('scheduledTasks', 'by-user', userId)

  const tx = db.transaction(
    [
      'accounts',
      'habits',
      'roadmaps',
      'roadmapTasks',
      'scheduledTasks',
      'dailyProgress',
      'weeklySummaries',
      'pdfUploads',
    ],
    'readwrite'
  )

  for (const r of roadmaps) {
    for (const t of await tx.objectStore('roadmapTasks').index('by-roadmap').getAllKeys(r.id)) {
      await tx.objectStore('roadmapTasks').delete(t)
    }
    await tx.objectStore('roadmaps').delete(r.id)
  }
  for (const t of scheduledTasks) {
    for (const k of await tx.objectStore('dailyProgress').index('by-task').getAllKeys(t.id)) {
      await tx.objectStore('dailyProgress').delete(k)
    }
    await tx.objectStore('scheduledTasks').delete(t.id)
  }
  for (const k of await tx.objectStore('habits').index('by-user').getAllKeys(userId)) {
    await tx.objectStore('habits').delete(k)
  }
  for (const k of await tx.objectStore('weeklySummaries').index('by-user').getAllKeys(userId)) {
    await tx.objectStore('weeklySummaries').delete(k)
  }
  for (const k of await tx.objectStore('pdfUploads').index('by-user').getAllKeys(userId)) {
    await tx.objectStore('pdfUploads').delete(k)
  }
  await tx.objectStore('accounts').delete(userId)
  await tx.done
}

export type {
  UserAccount,
  Habit,
  Roadmap,
  RoadmapTask,
  ScheduledTask,
  DailyProgress,
  WeeklySummary,
  PDFUpload,
  SyncQueueItem,
  AccountType,
}
