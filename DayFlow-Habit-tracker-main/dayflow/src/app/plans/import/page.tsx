'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import { FileText, Calendar, ChevronLeft, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PDFUploadZone } from '@/components/pdf/upload-zone'
import { TaskReview } from '@/components/pdf/task-review'
import type { ExtractedTask, Roadmap, RoadmapTask, ScheduledTask } from '@/types'
import { saveRoadmap, saveRoadmapTask, saveScheduledTask } from '@/lib/db'
import { DashboardShell } from '@/components/layout/dashboard-shell'

type ImportStep = 'upload' | 'review' | 'schedule' | 'confirm'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export default function ImportPage() {
  const router = useRouter()
  const { account } = useAuth()
  const { toast } = useToast()
  const [step, setStep] = React.useState<ImportStep>('upload')
  const [file, setFile] = React.useState<File | null>(null)
  const [tasks, setTasks] = React.useState<ExtractedTask[]>([])
  const [roadmapTitle, setRoadmapTitle] = React.useState('')
  const [startDate, setStartDate] = React.useState(new Date().toISOString().slice(0, 10))

  const isProcessing = step === 'upload' && file !== null && tasks.length === 0

  async function handleFileUpload(selectedFile: File) {
    if (!account) return
    setFile(selectedFile)
    setStep('upload')

    // Upload to server
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('userId', account.id)

    try {
      const uploadRes = await fetch('/api/pdf/upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const uploadData = await uploadRes.json()

      // Extract text
      const extractRes = await fetch('/api/pdf/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storedFileName: uploadData.storedFileName, fileName: uploadData.fileName }),
      })
      if (!extractRes.ok) throw new Error('Extraction failed')
      const extractData = await extractRes.json()

      // AI extract tasks
      const aiRes = await fetch('/api/ai/extract-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedText: extractData.extractedText,
          fileName: extractData.fileName,
          roadmapTitle: roadmapTitle || selectedFile.name.replace('.pdf', ''),
        }),
      })
      if (!aiRes.ok) throw new Error('Task extraction failed')
      const aiData: any = await aiRes.json()

      const extractedTasks: ExtractedTask[] = aiData.tasks.map((t: any, i: number) => ({
        id: `task-${i}`,
        originalDayNumber: t.originalDayNumber || i + 1,
        title: t.title,
        description: t.description,
        trackingType: t.trackingType || 'checkbox',
        targetValue: t.targetValue,
        targetUnit: t.targetUnit,
        estimatedDuration: t.estimatedDuration,
        priority: t.priority || 'medium',
        dependsOnTaskId: t.dependsOnTaskId,
        confidence: t.confidence || 'medium',
      }))

      setTasks(extractedTasks)
      if (!roadmapTitle) setRoadmapTitle(selectedFile.name.replace('.pdf', ''))
      setStep('review')
    } catch (err) {
      console.error('Import error:', err)
      toast({ title: 'Import failed', description: err instanceof Error ? err.message : 'Unknown error' })
      setStep('upload')
    }
  }

  function updateTask(updated: ExtractedTask) {
    setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)))
  }

  function removeTask(id: string) {
    setTasks(tasks.filter((t) => t.id !== id))
  }

  function addTask() {
    const newTask: ExtractedTask = {
      id: generateId(),
      originalDayNumber: tasks.length > 0 ? Math.max(...tasks.map((t) => t.originalDayNumber)) + 1 : 1,
      title: '',
      description: null,
      trackingType: 'checkbox',
      targetValue: null,
      targetUnit: null,
      estimatedDuration: null,
      priority: 'medium',
      dependsOnTaskId: null,
      confidence: 'medium',
      edited: true,
    }
    setTasks([...tasks, newTask])
  }

  async function confirmImport() {
    if (!account) return
    if (!roadmapTitle.trim()) {
      toast({ title: 'Missing title', description: 'Please give your roadmap a name.' })
      return
    }
    const validTasks = tasks.filter((task) => task.title.trim())
    if (validTasks.length === 0) {
      toast({ title: 'No valid tasks', description: 'Add at least one task with a name before importing.' })
      setStep('review')
      return
    }

    try {
      // The app is local-first: persist imported records directly to IndexedDB.
      // Previously the API only returned validated objects; it did not save them,
      // which made PDF extraction appear successful while tasks vanished afterward.
      const now = new Date().toISOString()
      const roadmap: Roadmap = {
        id: `${account.id}-${generateId()}`,
        userId: account.id,
        title: roadmapTitle.trim(),
        sourceType: 'pdf',
        originalFilePath: file?.name || null,
        startDate,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        deletedAt: null,
        version: 1,
      }
      const sorted = [...validTasks].sort((a, b) => a.originalDayNumber - b.originalDayNumber || a.title.localeCompare(b.title))

      // Create durable local roadmap-task records and retain a mapping from the
      // extraction IDs to the real persisted IDs for dependency links.
      const taskIdMap = new Map<string, string>()
      for (const task of sorted) taskIdMap.set(task.id, generateId())
      const roadmapTasks: RoadmapTask[] = sorted.map((task) => ({
        id: taskIdMap.get(task.id)!,
        roadmapId: roadmap.id,
        originalDayNumber: Math.max(1, Math.floor(task.originalDayNumber || 1)),
        title: task.title.trim(),
        description: task.description || null,
        trackingType: task.trackingType,
        targetValue: task.targetValue ?? null,
        targetUnit: task.targetUnit ?? null,
        estimatedDuration: task.estimatedDuration ?? null,
        priority: task.priority || 'medium',
        dependsOnTaskId: task.dependsOnTaskId ? taskIdMap.get(task.dependsOnTaskId) ?? null : null,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        deletedAt: null,
        version: 1,
      }))

      // Build scheduled tasks in memory and commit them locally. This avoids one
      // HTTP round-trip per extracted item and works reliably for large PDFs.
      const scheduledTasks: ScheduledTask[] = sorted.map((task) => {
        const plannedDate = addDays(startDate, Math.max(0, Math.floor(task.originalDayNumber || 1) - 1))
        return {
          id: `${account.id}-roadmap-${roadmap.id}-${taskIdMap.get(task.id)}`,
          userId: account.id,
          roadmapTaskId: taskIdMap.get(task.id)!,
          habitId: null,
          title: task.title.trim(),
          description: task.description || null,
          trackingType: task.trackingType,
          targetValue: task.targetValue ?? null,
          targetUnit: task.targetUnit ?? null,
          estimatedDuration: task.estimatedDuration ?? null,
          priority: task.priority || 'medium',
          scheduledDate: plannedDate,
          originalPlannedDate: plannedDate,
          status: 'pending',
          carryoverSourceId: null,
          dependsOnTaskId: task.dependsOnTaskId ? taskIdMap.get(task.dependsOnTaskId) ?? null : null,
          actualValue: null,
          notes: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
          deletedAt: null,
          version: 1,
        }
      })

      await saveRoadmap(roadmap)
      for (const roadmapTask of roadmapTasks) await saveRoadmapTask(roadmapTask)
      for (const scheduledTask of scheduledTasks) await saveScheduledTask(scheduledTask)

      toast({
        title: 'Roadmap imported',
        description: `${roadmapTitle} imported with ${scheduledTasks.length} tasks saved locally. They will appear in Today on their scheduled dates.`,
      })
      router.push('/today')
    } catch (err) {
      console.error('Confirm import error:', err)
      toast({ title: 'Import incomplete', description: err instanceof Error ? err.message : 'Could not save the imported tasks. Please try again.' })
    }
  }

  const progressPct = step === 'upload' ? 25 : step === 'review' ? 50 : step === 'schedule' ? 75 : 100

  const stepLabels: Record<ImportStep, string> = {
    upload: 'Upload PDF',
    review: 'Review Tasks',
    schedule: 'Set Start Date',
    confirm: 'Confirm',
  }

  return (
    <DashboardShell className="min-h-screen bg-background p-4 lg:p-6">
      <nav className="flex items-center justify-between mb-6">
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStep('upload')
              setFile(null)
              setTasks([])
              router.push('/plans')
            }}
          >
            <ChevronLeft className="h-4 w-4" /> Back to Plans
          </Button>
          <h1 className="text-2xl font-bold mt-2">Import Roadmap</h1>
        </div>
      </nav>

      {/* Progress steps */}
      <div className="flex w-full gap-1 mb-6">
        {['upload', 'review', 'schedule', 'confirm'].map((s, i) => {
          const active = step === s
          const completed = ['upload', 'review', 'schedule', 'confirm'].indexOf(step) > i
          return (
            <div
              key={s}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 relative',
                active ? 'text-primary' : completed ? 'text-emerald-600' : 'text-muted-foreground'
              )}
            >
              <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all">
                {active ? (
                  <div className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                ) : completed ? (
                  <CheckCircle2 className="h-4 w-4 fill-emerald-500" />
                ) : (
                  <div className="h-6 w-6 rounded-full border border-input text-muted-foreground flex items-center justify-center text-xs">
                    {i + 1}
                  </div>
                )}
              </div>
              <span className="text-xs font-medium">{stepLabels[s as ImportStep]}</span>
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <Card>
          <div className="p-6">
            <PDFUploadZone onUpload={handleFileUpload} isProcessing={isProcessing} />
          </div>
        </Card>
      )}

      {step === 'review' && (
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Review extracted tasks</h2>
              <p className="text-sm text-muted-foreground">
                Confirm or edit each task before scheduling. You can change anything below.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Roadmap name</label>
                <Input
                  value={roadmapTitle}
                  onChange={(e) => setRoadmapTitle(e.target.value)}
                  placeholder="e.g. AI Automation Learning Roadmap"
                />
              </div>
            </div>

            <TaskReview tasks={tasks} onUpdate={updateTask} onRemove={removeTask} onAdd={addTask} />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowRight className="h-4 w-4 mr-2 rotate-180" /> Re-upload
              </Button>
              <Button onClick={() => setStep('schedule')}>
                Continue to Schedule <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'schedule' && (
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Set start date</h2>
              <p className="text-sm text-muted-foreground">
                Tasks will be scheduled starting from this date, mapped to their original roadmap day numbers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Start date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Roadmap</label>
                <span className="text-sm text-muted-foreground block truncate">{roadmapTitle || 'Untitled'}</span>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="text-sm font-semibold mb-3">Task schedule preview</h3>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {[...tasks]
                  .sort((a, b) => a.originalDayNumber - b.originalDayNumber)
                  .map((task) => {
                    const date = addDays(startDate, task.originalDayNumber - 1)
                    return (
                      <div key={task.id} className="flex items-center justify-between gap-3 px-2 py-1 text-sm border-b border-border/50 last:border-0">
                        <span className="font-medium truncate">{task.title}</span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>Day {task.originalDayNumber}</span>
                          <span>•</span>
                          <span className="font-medium">{formatDate(date)}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('review')}>
                <ArrowRight className="h-4 w-4 mr-2 rotate-180" /> Back to review
              </Button>
              <Button onClick={() => setStep('confirm')}>
                Confirm import <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'confirm' && (
        <Card className="border-green-100 bg-green-50/50">
          <div className="p-6 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 mb-3" />
            <h2 className="text-lg font-semibold">Ready to import</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {tasks.length} task{tasks.length !== 1 ? 's' : ''} will be scheduled starting {formatDate(startDate)}.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setStep('schedule')}>
                Edit schedule
              </Button>
              <Button onClick={confirmImport}>
                Confirm & Activate
              </Button>
            </div>
          </div>
        </Card>
      )}
    </DashboardShell>
  )
}

function cn(...classes: (string | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
