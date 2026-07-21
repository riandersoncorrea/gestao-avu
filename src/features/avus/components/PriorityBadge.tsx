import { StatusBadge } from '@/components/StatusBadge'
import type { StatusTone } from '@/types'
import type { AvuPriority } from '../types'

const PRIORITY_CONFIG: Record<AvuPriority, { label: string; tone: StatusTone }> = {
  CRITICA: { label: 'Crítica', tone: 'danger' },
  ALTA: { label: 'Alta', tone: 'warning' },
  MEDIA: { label: 'Média', tone: 'info' },
  BAIXA: { label: 'Baixa', tone: 'neutral' },
}

export function PriorityBadge({ prioridade, className }: { prioridade: AvuPriority; className?: string }) {
  const config = PRIORITY_CONFIG[prioridade]
  return <StatusBadge tone={config.tone} label={config.label} className={className} />
}

export function priorityLabel(prioridade: AvuPriority): string {
  return PRIORITY_CONFIG[prioridade].label
}
