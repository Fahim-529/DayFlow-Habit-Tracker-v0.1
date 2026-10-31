'use client'

import * as React from 'react'
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface PDFUploadZoneProps {
  onUpload: (file: File) => void
  isProcessing?: boolean
  accepted?: string
}

export function PDFUploadZone({ onUpload, isProcessing = false }: PDFUploadZoneProps) {
  const [dragActive, setDragActive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const MAX_SIZE = 25 * 1024 * 1024 // 25 MB

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const files = e.dataTransfer.files
    if (files.length > 0) handleFile(files[0])
  }

  const handleFile = (file: File) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum size is 25 MB.')
      return
    }
    onUpload(file)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }

  return (
    <Card
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center transition-colors hover:border-primary/50',
        dragActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/50'
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isProcessing ? (
        <div className="flex flex-col items-center justify-center gap-3 py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Extracting text from PDF...</p>
        </div>
      ) : (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <Upload className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Upload a PDF roadmap</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Import a learning roadmap, workout plan, or study schedule. We'll extract
            the tasks and you'll review them before they're added to your plan.
          </p>
          <Button
            onClick={() => {
              const input = document.getElementById('pdf-file-input') as HTMLInputElement | null
              input?.click()
            }}
            disabled={isProcessing}
          >
            Choose PDF file
          </Button>
          <input
            id="pdf-file-input"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Max 25 MB • PDF only • Your file stays private on this device
          </p>
        </>
      )}
    </Card>
  )
}

function cn(...classes: (string | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
