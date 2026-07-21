import { StatusBadge } from '@/components/StatusBadge'
import type { StatusTone } from '@/types'
import type { AvuStatus } from '../types'

const STATUS_CONFIG: Record<AvuStatus, { label: string; tone: StatusTone }> = {
  NOVO: { label: 'Novo', tone: 'info' },
  TRIAGEM: { label: 'Triagem', tone: 'info' },
  PLANEJAMENTO: { label: 'Planejamento', tone: 'neutral' },
  PROGRAMADO: { label: 'Programado', tone: 'neutral' },
  EM_EXECUCAO: { label: 'Em execução', tone: 'warning' },
  AGUARDANDO_EVIDENCIAS: { label: 'Aguardando evidências', tone: 'warning' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando aprovação', tone: 'warning' },
  CONCLUIDO: { label: 'Concluído', tone: 'success' },
  REPROVADO: { label: 'Reprovado', tone: 'danger' },
  CANCELADO: { label: 'Cancelado', tone: 'neutral' },
}

export function AvuStatusBadge({ status, className }: { status: AvuStatus; className?: string }) {
  const config = STATUS_CONFIG[status]
  return <StatusBadge tone={config.tone} label={config.label} className={className} />
}

export function avuStatusLabel(status: AvuStatus): string {
  return STATUS_CONFIG[status].label
}
