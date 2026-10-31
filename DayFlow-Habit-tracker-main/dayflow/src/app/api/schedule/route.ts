/**
 * DayFlow — Schedule API Route
 *
 * Validates and returns scheduled task data. Persistence happens in the
 * client-side IndexedDB; this route provides server-side validation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const scheduleTaskSchema = z.object({
  userId: z.string().min(1),
  roadmapTaskId: z.string().nullable().optional(),
  habitId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  trackingType: z.enum(['checkbox', 'quantity', 'duration']),
  targetValue: z.number().nullable().optional(),
  targetUnit: z.string().nullable().optional(),
  estimatedDuration: z.number().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originalPlannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['pending', 'completed', 'partial', 'skipped']).default('pending'),
  carryoverSourceId: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = scheduleTaskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid scheduled task data', details: parsed.error.flatten() }, { status: 400 })
    }

    const now = new Date().toISOString()
    const scheduledTask = {
      id: `${parsed.data.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
      deletedAt: null as string | null,
      version: 1,
      actualValue: null,
      completedAt: null as string | null,
    }

    return NextResponse.json({ scheduledTask })
  } catch (err) {
    console.error('Schedule task error:', err)
    return NextResponse.json({ error: 'Failed to schedule task' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    return NextResponse.json({ scheduledTasks: [] })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to list scheduled tasks' }, { status: 500 })
  }
}
