import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card } from '@/components/Card'
import { cn } from '@/lib/utils'

export interface KpiCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  trend?: { value: string; direction: 'up' | 'down' }
  className?: string
}

export function KpiCard({ label, value, icon: Icon, trend, className }: KpiCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-graphite-800">{value}</p>
        </div>
        {Icon && (
          <div className="rounded-xl bg-primary-50 p-2.5 text-primary-600">
            <Icon className="size-5" />
          </div>
        )}
      </div>
      {trend && (
        <p
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            trend.direction === 'up' ? 'text-secondary-600' : 'text-magenta-600',
          )}
        >
          {trend.direction === 'up' ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
          {trend.value}
        </p>
      )}
    </Card>
  )
}
