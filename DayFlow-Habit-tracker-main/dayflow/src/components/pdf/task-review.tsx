'use client'

import * as React from 'react'
import { CheckCircle2, AlertTriangle, Edit2, Trash2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { ExtractedTask } from '@/types'

export interface TaskReviewProps {
  tasks: ExtractedTask[]
  onUpdate: (task: ExtractedTask) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

export function TaskReview({ tasks, onUpdate, onRemove, onAdd }: TaskReviewProps) {
  const confidenceColors: Record<string, string> = {
    high: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    medium: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Review extracted tasks</h3>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3 w-3" /> Add task
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Edit any task below. Tasks with <span className="font-medium">low confidence</span> need your review.
      </p>

      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onUpdate={onUpdate}
            onRemove={onRemove}
            confidenceColors={confidenceColors}
          />
        ))}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onUpdate,
  onRemove,
  confidenceColors,
}: {
  task: ExtractedTask
  onUpdate: (task: ExtractedTask) => void
  onRemove: (id: string) => void
  confidenceColors: Record<string, string>
}) {
  const [editing, setEditing] = React.useState(false)
  const [title, setTitle] = React.useState(task.title)
  const [day, setDay] = React.useState(String(task.originalDayNumber))
  const [tracking, setTracking] = React.useState(task.trackingType)
  const [targetValue, setTargetValue] = React.useState(String(task.targetValue ?? ''))
  const [targetUnit, setTargetUnit] = React.useState(task.targetUnit ?? '')

  const confidenceVariant = confidenceColors[task.confidence] || confidenceColors.medium

  const updateField = (patch: Partial<ExtractedTask>) => {
    const updated: ExtractedTask = { ...task, ...patch, edited: true }
    onUpdate(updated)
    setEditing(false)
  }

  return (
    <Card className="overflow-hidden">
      {editing ? (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Day</label>
              <Input
                type="number"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={tracking}
                onChange={(e) => setTracking(e.target.value as any)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="checkbox">Checkbox</option>
                <option value="quantity">Quantity</option>
                <option value="duration">Duration</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Target</label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="h-9 text-sm w-16"
                />
                <Input
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value)}
                  placeholder="unit"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => {
              updateField({
                title: title.trim(),
                originalDayNumber: parseInt(day) || 1,
                trackingType: tracking,
                targetValue: targetValue ? parseFloat(targetValue) : null,
                targetUnit: targetUnit || null,
              })
            }}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-2 mb-1">
              <span className="font-medium">{task.title}</span>
              <Badge variant={task.confidence === 'high' ? 'success' : task.confidence === 'medium' ? 'warning' : 'destructive'} className="text-xs">
                {task.confidence} confidence
              </Badge>
              {task.edited && <Badge variant="outline" className="text-xs">Edited</Badge>}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Day {task.originalDayNumber}</span>
              <span>•</span>
              <span>{task.trackingType}</span>
              {task.targetValue && task.targetUnit && <span>{task.targetValue} {task.targetUnit}</span>}
              {task.estimatedDuration && <span>• {task.estimatedDuration} min</span>}
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onRemove(task.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
