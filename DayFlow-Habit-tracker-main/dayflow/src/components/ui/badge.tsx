import * as React from 'react'
import { cn } from '@/components/ui/cn'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
  size?: 'default' | 'sm'
}

const badgeVariants = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  outline: 'border border-input bg-background',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
} as const

const badgeSizes = {
  default: 'px-2.5 py-0.5 text-xs',
  sm: 'px-2 py-0.5 text-[10px]',
} as const

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant = 'default', size = 'default', ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border',
        badgeVariants[variant],
        badgeSizes[size],
        className
      )}
      {...props}
    />
  )
})

Badge.displayName = 'Badge'

export { Badge, badgeVariants }
