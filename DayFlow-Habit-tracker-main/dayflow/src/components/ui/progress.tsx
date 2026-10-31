import * as React from 'react'
import { cn } from '@/components/ui/cn'

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('w-full overflow-hidden rounded-full border bg-secondary', className)}
      {...props}
    >
      <div
        className="flex items-center justify-between overflow-hidden whitespace-nowrap rounded-full bg-primary"
        style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
      >
        <span className="absolute left-2 xs:left-3 text-[10px] font-medium text-primary-foreground shadow shadow-black/40">
          {Math.round(value ?? 0)}%
        </span>
      </div>
    </div>
  )
})

Progress.displayName = 'Progress'

export { Progress }
