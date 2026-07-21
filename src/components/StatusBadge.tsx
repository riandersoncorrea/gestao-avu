import type { StatusTone } from '@/types'
import { Badge } from '@/components/Badge'
import { cn } from '@/lib/utils'

export interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
}

const toneMap: Record<StatusTone, { badge: 'primary' | 'secondary' | 'gold' | 'magenta' | 'sky' | 'gray'; dot: string }> = {
  success: { badge: 'secondary', dot: 'bg-secondary-500' },
  warning: { badge: 'gold', dot: 'bg-gold-500' },
  danger: { badge: 'magenta', dot: 'bg-magenta-500' },
  info: { badge: 'sky', dot: 'bg-sky-500' },
  neutral: { badge: 'gray', dot: 'bg-gray-500' },
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  const { badge, dot } = toneMap[tone]

  return (
    <Badge color={badge} className={cn(className)}>
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {label}
    </Badge>
  )
}
