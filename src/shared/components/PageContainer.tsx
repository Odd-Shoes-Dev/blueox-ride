import { type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export type PageContainerSize = 'narrow' | 'default' | 'wide'

// Central place to change how wide pages get on larger screens. 'narrow' is
// for single-column forms (auth, profile) that shouldn't stretch even on a
// big monitor. 'default' is for focused single-flow pages (ride details,
// payment, create ride). 'wide' is for feed/list pages (home, search,
// my rides) that should actually use the extra space on tablet/desktop
// instead of sitting in a phone-width column with empty space on both sides.
const sizeClasses: Record<PageContainerSize, string> = {
  narrow: 'max-w-md',
  default: 'max-w-lg md:max-w-2xl lg:max-w-3xl',
  wide: 'max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl',
}

interface PageContainerProps {
  size?: PageContainerSize
  className?: string
  children: ReactNode
}

export function PageContainer({ size = 'default', className, children }: PageContainerProps) {
  return <div className={cn(sizeClasses[size], 'mx-auto', className)}>{children}</div>
}
