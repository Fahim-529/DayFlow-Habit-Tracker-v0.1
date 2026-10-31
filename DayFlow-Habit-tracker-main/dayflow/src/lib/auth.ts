/**
 * Local-first authentication for DayFlow.
 *
 * Supports two account types:
 *  - local: registered and stored only on this device (IndexedDB)
 *  - online: linked to Supabase Auth (optional sync)
 *
 * Security notes:
 *  - Passwords are hashed with bcrypt (salted, cost 10). Older accounts that used
 *    unsalted SHA-256 are still accepted once and are upgraded to bcrypt on login.
 *  - The password hash is NEVER placed in app state or localStorage; it only
 *    lives in the local database record.
 *  - Repeated failed logins are throttled.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import bcrypt from 'bcryptjs'
import { sha256 } from 'js-sha256'
import { getAccount, getAccountByUsername, saveAccount, type UserAccount } from './db'

const SESSION_KEY = 'dayflow-session'
const BCRYPT_ROUNDS = 10
const MIN_PASSWORD = 8
const MAX_PASSWORD = 72 // bcrypt ignores anything beyond 72 bytes
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000

export interface AuthState {
  account: UserAccount | null
  isAuthenticated: boolean
  isLoading: boolean
  offlineMode: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  register: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  linkOnline: (supabaseUserId: string) => Promise<void>
  unlinkOnline: () => Promise<void>
  setOfflineMode: (offline: boolean) => void
  init: () => Promise<void>
}

/** Remove the password hash before an account object goes into app state. */
function publicAccount(account: UserAccount): UserAccount {
  const { passwordHash: _omit, ...rest } = account
  return rest
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

async function verifyPassword(stored: string | undefined, input: string): Promise<{ ok: boolean; legacy: boolean }> {
  if (!stored) return { ok: false, legacy: false }
  if (stored.startsWith('sha256:')) {
    const expected = stored
    const actual = 'sha256:' + sha256(input)
    let diff = expected.length ^ actual.length
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
      diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i)
    }
    return { ok: diff === 0, legacy: true }
  }
  try {
    return { ok: await bcrypt.compare(input, stored), legacy: false }
  } catch {
    return { ok: false, legacy: false }
  }
}

// In-memory brute-force throttle (resets when the app restarts).
const failures = new Map<string, { count: number; lockedUntil: number }>()

function lockoutSecondsLeft(key: string): number {
  const f = failures.get(key)
  if (!f || f.lockedUntil <= Date.now()) return 0
  return Math.ceil((f.lockedUntil - Date.now()) / 1000)
}

function recordFailure(key: string) {
  const f = failures.get(key) ?? { count: 0, lockedUntil: 0 }
  f.count += 1
  if (f.count >= MAX_ATTEMPTS) {
    f.count = 0
    f.lockedUntil = Date.now() + LOCKOUT_MS
  }
  failures.set(key, f)
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      account: null,
      isAuthenticated: false,
      isLoading: false,
      offlineMode: typeof navigator === 'undefined' || !navigator.onLine,

      init: async () => {
        set({ isLoading: true })
        try {
          const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null
          if (stored) {
            const accountId = JSON.parse(stored)
            const account = await getAccount(accountId)
            if (account) {
              set({ account: publicAccount(account), isAuthenticated: true, isLoading: false })
              return
            }
          }
          set({ account: null, isAuthenticated: false, isLoading: false })
        } catch (err) {
          console.error('Auth init failed', err)
          set({ account: null, isAuthenticated: false, isLoading: false })
        }
      },

      login: async (rawUsername, password) => {
        const username = rawUsername.trim()
        const key = username.toLowerCase()
        const wait = lockoutSecondsLeft(key)
        if (wait > 0) {
          return { ok: false, error: `Too many failed attempts. Try again in ${wait} seconds.` }
        }

        set({ isLoading: true })
        try {
          const account = await getAccountByUsername(username)
          const result = account
            ? await verifyPassword(account.passwordHash, password)
            : { ok: false, legacy: false }

          if (!account || !result.ok) {
            recordFailure(key)
            set({ isLoading: false })
            return { ok: false, error: 'Invalid username or password.' }
          }

          failures.delete(key)

          // Upgrade old unsalted SHA-256 hashes to bcrypt.
          if (result.legacy) {
            const upgraded = { ...account, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) }
            await saveAccount(upgraded)
          }

          localStorage.setItem(SESSION_KEY, JSON.stringify(account.id))
          set({
            account: publicAccount(account),
            isAuthenticated: true,
            isLoading: false,
            offlineMode: !navigator.onLine,
          })
          return { ok: true }
        } catch (err) {
          console.error('Login failed', err)
          set({ isLoading: false })
          return { ok: false, error: 'Login failed. Please try again.' }
        }
      },

      register: async (rawUsername, password) => {
        const username = rawUsername.trim()
        if (username.length < 2 || username.length > 50) {
          return { ok: false, error: 'Username must be between 2 and 50 characters.' }
        }
        if (password.length < MIN_PASSWORD) {
          return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` }
        }
        if (password.length > MAX_PASSWORD) {
          return { ok: false, error: `Password must be at most ${MAX_PASSWORD} characters.` }
        }

        set({ isLoading: true })
        try {
          const existing = await getAccountByUsername(username)
          if (existing) {
            set({ isLoading: false })
            return { ok: false, error: 'An account with this username already exists.' }
          }

          const id = newId()
          const now = new Date().toISOString()
          const account: UserAccount = {
            id,
            username,
            accountType: 'local',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            createdAt: now,
            updatedAt: now,
            isLinkedOnline: false,
            supabaseUserId: null,
            passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          }

          await saveAccount(account)
          localStorage.setItem(SESSION_KEY, JSON.stringify(id))
          set({
            account: publicAccount(account),
            isAuthenticated: true,
            isLoading: false,
            offlineMode: !navigator.onLine,
          })
          return { ok: true }
        } catch (err) {
          console.error('Registration failed', err)
          set({ isLoading: false })
          return { ok: false, error: 'Registration failed. Please try again.' }
        }
      },

      logout: async () => {
        localStorage.removeItem(SESSION_KEY)
        set({ account: null, isAuthenticated: false, isLoading: false })
      },

      linkOnline: async (supabaseUserId) => {
        const current = get().account
        if (!current) return
        const stored = await getAccount(current.id)
        if (!stored) return
        const updated: UserAccount = { ...stored, isLinkedOnline: true, supabaseUserId }
        await saveAccount(updated)
        set({ account: publicAccount(updated) })
      },

      unlinkOnline: async () => {
        const current = get().account
        if (!current) return
        const stored = await getAccount(current.id)
        if (!stored) return
        const updated: UserAccount = { ...stored, isLinkedOnline: false, supabaseUserId: null }
        await saveAccount(updated)
        set({ account: publicAccount(updated) })
      },

      setOfflineMode: (offline) => set({ offlineMode: offline }),
    }),
    {
      name: 'dayflow-auth',
      storage: createJSONStorage(() => localStorage),
      // Only non-sensitive fields are persisted (no password hash).
      partialize: (state) => ({
        account: state.account ? publicAccount(state.account) : null,
        isAuthenticated: state.isAuthenticated,
        offlineMode: state.offlineMode,
      }),
    }
  )
)
