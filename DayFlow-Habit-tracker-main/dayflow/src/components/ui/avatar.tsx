import * as React from 'react'
import { cn } from '@/components/ui/cn'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(({ className, src, alt, ...props }, ref) => {
  if (src) {
    return (
      <img
        ref={ref as React.Ref<HTMLImageElement>}
        alt={alt}
        src={src}
        className={cn('aspect-square h-10 w-10 rounded-full bg-secondary object-cover', className)}
        {...props}
      />
    )
  }
  return (
    <div ref={ref} className={cn('aspect-square h-10 w-10 rounded-full bg-secondary', className)} {...props} />
  )
})

Avatar.displayName = 'Avatar'

export { Avatar }
