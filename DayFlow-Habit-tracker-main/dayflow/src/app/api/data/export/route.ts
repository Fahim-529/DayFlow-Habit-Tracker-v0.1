/**
 * DayFlow — Data Export API Route
 *
 * Local data is exported on the client (Sidebar -> Export), straight from the
 * local database. Server-side export is not implemented.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Not implemented. Use Export in the app sidebar to download your data.' },
    { status: 501 }
  )
}
