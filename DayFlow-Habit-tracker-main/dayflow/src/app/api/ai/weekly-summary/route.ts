/**
 * DayFlow — AI Weekly Summary API Route
 *
 * Generates an evidence-based weekly summary from saved performance data.
 * Server-side only — the AI API key is never exposed to the client.
 *
 * Requires: AI_API_KEY and AI_API_URL environment variables.
 * If not configured, returns a deterministic summary based on the data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

interface WeeklySummaryRequest {
  userId: string
  weekStart: string
  weekEnd: string
  overallPercentage: number
  completedCount: number
  partialCount: number
  totalEligible: number
  categoryBreakdown: Record<string, { completed: number; total: number }>
  dailyBreakdown: Record<string, number>
}

function deterministicSummary(data: WeeklySummaryRequest): string {
  const { overallPercentage, completedCount, partialCount, totalEligible, categoryBreakdown, dailyBreakdown } = data

  const bestDay = Object.entries(dailyBreakdown).sort((a, b) => b[1] - a[1])[0]
  const worstDay = Object.entries(dailyBreakdown).sort((a, b) => a[1] - b[1])[0]

  const bestCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1].completed - a[1].completed)[0]
  const worstCategory = Object.entries(categoryBreakdown).sort((a, b) => a[1].completed - b[1].completed)[0]

  let summary = `You completed ${completedCount} of ${totalEligible} planned tasks this week (${overallPercentage}% overall), with ${partialCount} partial completions. `

  if (overallPercentage >= 70) {
    summary += 'Strong overall progress — keep up the momentum. '
  } else if (overallPercentage >= 40) {
    summary += 'Moderate progress this week. '
  } else {
    summary += 'This week was challenging. '
  }

  if (bestDay) {
    summary += `Your best day was ${bestDay[0]} (${bestDay[1]}% completion). `
  }
  if (worstDay && worstDay[1] < bestDay[1]) {
    summary += `Your lightest day was ${worstDay[0]} (${worstDay[1]}% completion). `
  }

  if (bestCategory) {
    summary += `${bestCategory[0]} was your strongest category. `
  }
  if (worstCategory && worstCategory[1].total > 0 && worstCategory[1].completed < bestCategory[1].completed) {
    summary += `${worstCategory[0]} needs attention — consider adjusting timing or duration. `
  }

  if (overallPercentage < 50) {
    summary += 'Consider reducing your weekly target or spreading tasks more evenly across days.'
  }

  return summary
}

const weeklySummarySchema = z.object({
  userId: z.string().max(100).optional().default(''),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overallPercentage: z.number().min(0).max(100),
  completedCount: z.number().min(0),
  partialCount: z.number().min(0),
  totalEligible: z.number().min(0),
  categoryBreakdown: z
    .record(z.string().max(100), z.object({ completed: z.number(), total: z.number() }))
    .default({}),
  dailyBreakdown: z.record(z.string().max(100), z.number()).default({}),
})

export async function POST(request: NextRequest) {
  try {
    const parsedBody = weeklySummarySchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid weekly summary data' }, { status: 400 })
    }
    const body: WeeklySummaryRequest = parsedBody.data

    const aiApiKey = process.env.AI_API_KEY
    const aiApiUrl = process.env.AI_API_URL

    let summary: string
    let aiUsed = false

    if (aiApiKey && aiApiUrl) {
      aiUsed = true
      try {
        const response = await fetch(aiApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiApiKey}`,
          },
          body: JSON.stringify({
            model: process.env.AI_MODEL || 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: `You are a helpful coach that writes evidence-based weekly summaries for a habit tracker.
Write a short, supportive summary (2-4 sentences) based on the user's actual performance data.
Only mention categories and trends supported by the data. Do not make unsupported recommendations.
Be encouraging but honest. Avoid generic praise.`,
              },
              {
                role: 'user',
                content: `Weekly performance data:
- Week: ${body.weekStart} to ${body.weekEnd}
- Overall completion: ${body.overallPercentage}%
- Tasks completed: ${body.completedCount} of ${body.totalEligible}
- Partial completions: ${body.partialCount}
- Category breakdown: ${JSON.stringify(body.categoryBreakdown)}
- Daily breakdown: ${JSON.stringify(body.dailyBreakdown)}

Write a 2-4 sentence summary based only on this data.`,
              },
            ],
            temperature: 0.3,
            max_tokens: 400,
          }),
        })

        if (!response.ok) {
          throw new Error(`AI API responded ${response.status}`)
        }

        const aiResult = await response.json()
        summary = aiResult.choices?.[0]?.message?.content || deterministicSummary(body)
      } catch (aiErr) {
        console.error('AI summary failed, using deterministic:', aiErr)
        summary = deterministicSummary(body)
        aiUsed = false
      }
    } else {
      summary = deterministicSummary(body)
      aiUsed = false
    }

    return NextResponse.json({
      summary,
      aiUsed,
      weekStart: body.weekStart,
      weekEnd: body.weekEnd,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Weekly summary error:', err)
    return NextResponse.json({ error: 'Failed to generate weekly summary' }, { status: 500 })
  }
}
