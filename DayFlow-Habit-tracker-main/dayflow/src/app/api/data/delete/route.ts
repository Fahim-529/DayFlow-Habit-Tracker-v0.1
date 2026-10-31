/**
 * DayFlow — Data Delete API Route
 *
 * Local data is deleted on the client (Sidebar -> Delete data).
 * Server-side/cloud deletion is not implemented.
 */

import { NextResponse } from 'next/server'

export async function DELETE() {
  return NextResponse.json(
    { error: 'Not implemented. Use Delete data in the app sidebar to remove your local data.' },
    { status: 501 }
  )
}
