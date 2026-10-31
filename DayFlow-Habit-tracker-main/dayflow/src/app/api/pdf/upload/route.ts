/**
 * DayFlow — PDF Upload API Route
 *
 * Stores an uploaded PDF temporarily so its text can be extracted.
 * The extract route deletes the file as soon as extraction finishes.
 *
 * Security:
 *  - Only real PDFs (checked by file signature, not just name/type)
 *  - Max file size: 25 MB (checked before the body is read)
 *  - Random server-side file name; the client never learns a file-system path
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export const runtime = 'nodejs'

const UPLOAD_DIR = process.env.DAYFLOW_UPLOAD_DIR || path.join(process.cwd(), 'uploads')
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }

    const declaredLength = Number(request.headers.get('content-length') || 0)
    if (declaredLength > MAX_FILE_SIZE + 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 25 MB.' }, { status: 413 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const userId = formData.get('userId')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (typeof userId !== 'string' || !userId || userId.length > 100) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 25 MB.' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Real PDFs start with "%PDF-"
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ error: 'Only valid PDF files are allowed' }, { status: 400 })
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true })

    const storedFileName = `${crypto.randomUUID()}.pdf`
    await fs.writeFile(path.join(UPLOAD_DIR, storedFileName), buffer, { mode: 0o600 })

    return NextResponse.json({
      id: crypto.randomUUID(),
      fileName: file.name.slice(0, 200),
      storedFileName,
      fileSize: file.size,
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('PDF upload error:', err)
    return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 })
  }
}
