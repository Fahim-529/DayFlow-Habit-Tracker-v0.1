/**
 * DayFlow — Roadmaps API Route
 *
 * Create, list, and update roadmaps. All operations are server-side validated.
 * The actual persistence happens in IndexedDB on the client; this route
 * validates and returns the data for the client to store.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const createRoadmapSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  sourceType: z.enum(['pdf', 'manual']),
  originalFilePath: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createRoadmapSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid roadmap data', details: parsed.error.flatten() }, { status: 400 })
    }

    const now = new Date().toISOString()
    const roadmap = {
      id: `${parsed.data.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
      deletedAt: null as string | null,
      version: 1,
    }

    return NextResponse.json({ roadmap })
  } catch (err) {
    console.error('Create roadmap error:', err)
    return NextResponse.json({ error: 'Failed to create roadmap' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Return empty — client reads from IndexedDB
    return NextResponse.json({ roadmaps: [] })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to list roadmaps' }, { status: 500 })
  }
}
