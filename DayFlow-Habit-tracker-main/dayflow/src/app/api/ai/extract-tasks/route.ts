/**
 * DayFlow — AI Task Extraction API Route
 *
 * Converts extracted PDF text into structured, validated task data.
 * Server-side only — the AI API key is never sent to the client.
 *
 * Requires: AI_API_KEY and AI_API_URL environment variables.
 * If not configured, returns a deterministic fallback parse so the app
 * remains usable (user can manually review/edit tasks).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

interface ExtractedTask {
  originalDayNumber: number
  title: string
  description?: string | null
  trackingType: 'checkbox' | 'quantity' | 'duration'
  targetValue?: number | null
  targetUnit?: string | null
  estimatedDuration?: number | null
  priority: 'low' | 'medium' | 'high'
  dependsOnTaskId?: string | null
  confidence: 'high' | 'medium' | 'low'
}

interface ExtractTasksRequest {
  extractedText: string
  fileName?: string
  roadmapTitle?: string
}

function deterministicFallbackParse(text: string): ExtractedTask[] {
  /**
   * Simple deterministic parser that looks for "Day N:" patterns and
   * bullet-like lines. Used when no AI API key is configured.
   * Results are marked low confidence so the user reviews them.
   */
  const tasks: ExtractedTask[] = []
  const lines = text.split(/\r?\n/)
  let currentDay = 0
  let taskIndex = 0

  const dayRegex = /^day\s*(\d+)[:\-]?/i
  const bulletRegex = /^[\-\u2022\*•]\s+/i
  const numberRegex = /^\d+[\.\)]\s+/i

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const dayMatch = trimmed.match(dayRegex)
    if (dayMatch) {
      currentDay = parseInt(dayMatch[1], 10)
      continue
    }

    // Treat indented or bullet lines as tasks under the current day
    if (bulletRegex.test(trimmed) || numberRegex.test(trimmed) || trimmed.length > 2) {
      const cleanTitle = trimmed.replace(bulletRegex, '').replace(numberRegex, '').trim()
      if (cleanTitle) {
        taskIndex++
        tasks.push({
          originalDayNumber: currentDay || 0,
          title: cleanTitle,
          description: null,
          trackingType: 'checkbox',
          targetValue: null,
          targetUnit: null,
          estimatedDuration: null,
          priority: 'medium',
          dependsOnTaskId: null,
          confidence: 'low',
        })
      }
    }
  }

  return tasks
}

const extractTasksSchema = z.object({
  extractedText: z.string().min(1).max(500_000),
  fileName: z.string().max(200).optional(),
  roadmapTitle: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const parsedBody = extractTasksSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'No valid text to extract from' }, { status: 400 })
    }
    const { extractedText, fileName }: ExtractTasksRequest = parsedBody.data

    const aiApiKey = process.env.AI_API_KEY
    const aiApiUrl = process.env.AI_API_URL

    let tasks: ExtractedTask[]
    let aiUsed = false

    if (aiApiKey && aiApiUrl) {
      aiUsed = true
      try {
        // Call the AI provider's API (server-side only)
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
                content: `You are an assistant that extracts structured tasks from a learning roadmap or schedule PDF.
Extract each task as a JSON object with fields: originalDayNumber (number), title (string), description (string or null), trackingType ("checkbox"|"quantity"|"duration"), targetValue (number or null), targetUnit (string or null), estimatedDuration (minutes or null), priority ("low"|"medium"|"high"), dependsOnTaskId (string or null), confidence ("high"|"medium"|"low").
Return a JSON array of tasks. Look for "Day N" headers to assign originalDayNumber. If confidence is not high, mark as "medium" or "low" so the user reviews it.`,
              },
              {
                role: 'user',
                content: `PDF filename: ${fileName || 'unknown'}\n\nExtracted text:\n${extractedText.slice(0, 12000)}`,
              },
            ],
            temperature: 0.2,
            max_tokens: 2000,
          }),
        })

        if (!response.ok) {
          throw new Error(`AI API responded ${response.status}`)
        }

        const aiResult = await response.json()
        const aiContent = aiResult.choices?.[0]?.message?.content || '[]'

        // Parse AI output safely
        const cleaned = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(cleaned)

        if (Array.isArray(parsed)) {
          tasks = parsed.map((t: any, i: number) => ({
            originalDayNumber: typeof t.originalDayNumber === 'number' ? t.originalDayNumber : i + 1,
            title: String(t.title || 'Untitled task').slice(0, 200),
            description: t.description ? String(t.description).slice(0, 1000) : null,
            trackingType: ['checkbox', 'quantity', 'duration'].includes(t.trackingType) ? t.trackingType : 'checkbox',
            targetValue: typeof t.targetValue === 'number' ? t.targetValue : null,
            targetUnit: typeof t.targetUnit === 'string' ? t.targetUnit.slice(0, 50) : null,
            estimatedDuration: typeof t.estimatedDuration === 'number' ? t.estimatedDuration : null,
            priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
            dependsOnTaskId: typeof t.dependsOnTaskId === 'string' ? t.dependsOnTaskId : null,
            confidence: ['high', 'medium', 'low'].includes(t.confidence) ? t.confidence : 'medium',
          }))
        } else {
          throw new Error('AI response was not an array')
        }
      } catch (aiErr) {
        console.error('AI extraction failed, using fallback:', aiErr)
        tasks = deterministicFallbackParse(extractedText)
        aiUsed = false
      }
    } else {
      // No AI configured — use deterministic fallback
      tasks = deterministicFallbackParse(extractedText)
      aiUsed = false
    }

    return NextResponse.json({
      tasks,
      aiUsed,
      totalTasks: tasks.length,
      extractionMethod: aiUsed ? 'ai' : 'deterministic-fallback',
      note: aiUsed
        ? 'Tasks extracted by AI. Please review before confirming.'
        : 'AI not configured. Tasks parsed deterministically — please review carefully.',
    })
  } catch (err) {
    console.error('AI extraction error:', err)
    return NextResponse.json({ error: 'Failed to extract tasks' }, { status: 500 })
  }
}
