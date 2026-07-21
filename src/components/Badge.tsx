import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeColor = 'primary' | 'secondary' | 'gold' | 'magenta' | 'sky' | 'gray'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor
}

const colorClasses: Record<BadgeColor, string> = {
  primary: 'bg-primary-50 text-primary-700 ring-primary-200',
  secondary: 'bg-secondary-50 text-secondary-700 ring-secondary-200',
  gold: 'bg-gold-50 text-gold-800 ring-gold-200',
  magenta: 'bg-magenta-50 text-magenta-700 ring-magenta-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  gray: 'bg-gray-100 text-graphite-600 ring-gray-300',
}

export function Badge({ className, color = 'gray', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        colorClasses[color],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
