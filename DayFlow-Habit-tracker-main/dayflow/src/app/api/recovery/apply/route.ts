/**
 * DayFlow — Recovery Apply API Route
 *
 * Validates and returns carryover tasks to be inserted.
 * The client persists them to IndexedDB. This route validates dependencies
 * and workload before approving carryovers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  generateCarryovers,
  checkDependencyMove,
  checkWorkload,
  addDays,
} from '@/lib/scheduling'

const applySchema = z.object({
  userId: z.string().min(1),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceTasks: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['pending', 'completed', 'partial', 'skipped']),
      roadmapTaskId: z.string().nullable().optional(),
      habitId: z.string().nullable().optional(),
      title: z.string(),
      description: z.string().nullable().optional(),
      trackingType: z.enum(['checkbox', 'quantity', 'duration']),
      targetValue: z.number().nullable().optional(),
      targetUnit: z.string().nullable().optional(),
      estimatedDuration: z.number().nullable().optional(),
      priority: z.enum(['low', 'medium', 'high']),
      scheduledDate: z.string(),
      originalPlannedDate: z.string(),
      carryoverSourceId: z.string().nullable().optional(),
    })
  ),
  allTasks: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['pending', 'completed', 'partial', 'skipped']),
      title: z.string(),
      scheduledDate: z.string(),
      dependsOnTaskId: z.string().nullable().optional(),
    })
  ),
  alreadyCarriedSourceIds: z.array(z.string()).optional().default([]),
  maxTasksPerDay: z.number().optional().default(10),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = applySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
    }

    const { userId, sourceDate, targetDate, sourceTasks, allTasks, alreadyCarriedSourceIds, maxTasksPerDay } =
      parsed.data

    // Check workload for target date (excluding source tasks being moved)
    const workloadCheck = checkWorkload({
      targetDate,
      allTasks: allTasks as any,
      maxTasksPerDay,
    })

    if (!workloadCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          reason: workloadCheck.reason,
          currentLoad: workloadCheck.currentLoad,
          needsApproval: true,
        },
        { status: 200 }
      )
    }

    // Generate carryovers (idempotent — skips already-carried)
    const carryovers = generateCarryovers({
      sourceTasks: sourceTasks as any,
      sourceDate,
      targetDate,
      alreadyCarriedSourceIds: new Set(alreadyCarriedSourceIds),
      userId,
    })

    // Validate each carryover's dependencies
    const invalidCarryovers: string[] = []
    for (const c of carryovers) {
      const depCheck = checkDependencyMove({
        task: c,
        targetDate,
        allTasks: allTasks as any,
      })
      if (!depCheck.allowed) {
        invalidCarryovers.push(c.id)
      }
    }

    return NextResponse.json({
      ok: true,
      carryovers,
      skippedAlreadyCarried: alreadyCarriedSourceIds.length,
      invalidCarryovers,
      targetDate,
    })
  } catch (err) {
    console.error('Recovery apply error:', err)
    return NextResponse.json({ error: 'Failed to apply recovery' }, { status: 500 })
  }
}
