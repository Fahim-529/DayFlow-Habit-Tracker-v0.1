/**
 * DayFlow — Supabase Auth Callback Route (optional feature)
 *
 * Handles OAuth callbacks from Supabase Auth.
 * The app works fully without this; it is only used if Supabase is configured.
 *
 * Security: the access token is stored in an httpOnly cookie. It is never put
 * in a URL (URLs end up in history, logs and referrer headers).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** Only allow redirects to paths inside this app. */
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/today'
  }
  return value
}

export async function GET(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.session || !data.user) {
      return NextResponse.redirect(`${origin}/login?error=supabase_auth_failed`)
    }

    const response = NextResponse.redirect(`${origin}${next}`)
    response.cookies.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: data.session.expires_in ?? 3600,
    })
    return response
  } catch (err) {
    console.error('Supabase auth callback error:', err)
    return NextResponse.redirect(`${origin}/login?error=auth_error`)
  }
}
