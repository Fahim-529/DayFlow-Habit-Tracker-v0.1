/**
 * DayFlow — List PDF uploads API Route
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Client reads from IndexedDB; server returns empty list
    return NextResponse.json({ uploads: [] })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to list uploads' }, { status: 500 })
  }
}
