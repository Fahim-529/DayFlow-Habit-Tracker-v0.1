/**
 * DayFlow — Supabase Client
 *
 * Optional cloud sync. The app works fully offline without Supabase.
 * These clients are only used when the user links an online account.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function createSupabaseClient(accessToken?: string) {
  if (!isSupabaseConfigured()) {
    return null
  }

  const client = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: false, // we manage our own session
      autoRefreshToken: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  })

  return client
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>
