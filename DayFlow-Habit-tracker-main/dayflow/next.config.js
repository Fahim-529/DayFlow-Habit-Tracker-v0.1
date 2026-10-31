/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

let supabaseOrigin = ''
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  }
} catch {
  // ignore invalid URL; Supabase simply stays blocked by CSP
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ' ' + supabaseOrigin : ''}${isDev ? ' ws://localhost:3000' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output lets the desktop app run a tiny local Node server
  // (API routes such as PDF import keep working).
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
    // Make sure the PDF parser's worker/native files are copied into the standalone build.
    outputFileTracingIncludes: {
      '/api/pdf/extract': [
        './node_modules/pdf-parse/**/*',
        './node_modules/pdfjs-dist/**/*',
        './node_modules/@napi-rs/**/*',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
