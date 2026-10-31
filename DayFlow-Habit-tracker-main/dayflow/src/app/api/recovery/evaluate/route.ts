/**
 * DayFlow — Recovery Evaluate API Route
 *
 * Evaluates the 50% recovery rule for a given date and user.
 * Reads tasks from the request body (client provides IndexedDB data).
 * Server-side validation only — no secrets exposed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { evaluateRecovery, computeDailyCompletion } from '@/lib/scheduling'

const evaluateSchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['pending', 'completed', 'partial', 'skipped']),
      carryoverSourceId: z.string().nullable().optional(),
      targetValue: z.number().nullable().optional(),
      actualValue: z.number().nullable().optional(),
    })
  ),
  alreadyCarriedSourceIds: z.array(z.string()).optional().default([]),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = evaluateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
    }

    const { userId, date, tasks, alreadyCarriedSourceIds } = parsed.data

    // Convert plain objects to ScheduledTask shape for the shared logic
    const scheduledTasks = tasks.map((t) => ({
      id: t.id,
      userId,
      status: t.status,
      carryoverSourceId: t.carryoverSourceId ?? null,
      targetValue: t.targetValue ?? null,
      actualValue: t.actualValue ?? null,
      title: '',
      scheduledDate: date,
      originalPlannedDate: date,
      trackingType: 'checkbox' as const,
      priority: 'medium' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced' as const,
      version: 1,
    }))

    const evaluation = evaluateRecovery({
      tasks: scheduledTasks,
      date,
      alreadyCarriedSourceIds: new Set(alreadyCarriedSourceIds),
    })

    return NextResponse.json({ evaluation })
  } catch (err) {
    console.error('Recovery evaluate error:', err)
    return NextResponse.json({ error: 'Failed to evaluate recovery' }, { status: 500 })
  }
}
