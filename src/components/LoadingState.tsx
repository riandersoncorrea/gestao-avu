import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LoadingStateProps {
  label?: string
  className?: string
}

export function LoadingState({ label = 'Carregando...', className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center',
        className,
      )}
    >
      <Loader2 className="size-6 animate-spin text-primary-600" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  )
}
