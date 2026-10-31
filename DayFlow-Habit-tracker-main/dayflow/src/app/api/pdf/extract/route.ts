/**
 * DayFlow — PDF Text Extraction API Route
 *
 * Extracts text from a PDF that was uploaded through /api/pdf/upload,
 * then deletes that temporary file.
 *
 * Security:
 *  - The client may only name a file the upload route created
 *    (random UUID + ".pdf"). Arbitrary paths are impossible.
 *  - Server-side only. Never exposes AI keys or secrets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { PDFParse } from 'pdf-parse'
import fs from 'fs/promises'
import path from 'path'
import { z } from 'zod'

export const runtime = 'nodejs'

const UPLOAD_DIR = process.env.DAYFLOW_UPLOAD_DIR || path.join(process.cwd(), 'uploads')

const bodySchema = z.object({
  storedFileName: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i),
  fileName: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  let resolvedPath: string | null = null
  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid file reference' }, { status: 400 })
    }
    const { storedFileName, fileName } = parsed.data

    resolvedPath = path.join(UPLOAD_DIR, storedFileName)

    let dataBuffer: Buffer
    try {
      dataBuffer = await fs.readFile(resolvedPath)
    } catch {
      return NextResponse.json({ error: 'PDF file not found' }, { status: 404 })
    }

    const parser = new PDFParse({ data: new Uint8Array(dataBuffer) })
    try {
      const result = await parser.getText()
      const text: string = result.text || ''
      return NextResponse.json({
        fileName,
        numPages: result.total ?? 0,
        extractedText: text,
        textLength: text.length,
        extractedAt: new Date().toISOString(),
      })
    } finally {
      await parser.destroy().catch(() => undefined)
    }
  } catch (err) {
    console.error('PDF extraction error:', err)
    return NextResponse.json({ error: 'Failed to extract text from PDF' }, { status: 500 })
  } finally {
    // Don't keep users' documents on disk after extraction.
    if (resolvedPath) await fs.unlink(resolvedPath).catch(() => undefined)
  }
}
