import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * DayFlow — API request guard.
 *
 * Page access is handled client-side (sessions live in the browser's local
 * storage, which middleware cannot read). This middleware protects the API:
 *  - Desktop build: only accepts requests addressed to localhost/127.0.0.1
 *    (blocks DNS-rebinding attacks from malicious web pages).
 *  - All builds: rejects state-changing requests whose Origin header does not
 *    match the host (basic CSRF protection).
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function middleware(request: NextRequest) {
  const hostHeader = request.headers.get('host') || ''
  const hostname = hostHeader.replace(/:\d+$/, '').toLowerCase()

  if (process.env.DAYFLOW_DESKTOP === '1' && !LOCAL_HOSTS.has(hostname)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin')
    if (origin) {
      let originHost = ''
      try {
        originHost = new URL(origin).host
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (originHost !== hostHeader) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
