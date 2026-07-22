import { StatusBadge } from '@/components/StatusBadge'
import type { StatusTone } from '@/types'
import type { AvuImportStatus } from '../types'

const STATUS_CONFIG: Record<AvuImportStatus, { label: string; tone: StatusTone }> = {
  AGUARDANDO: { label: 'Aguardando', tone: 'neutral' },
  PROCESSANDO: { label: 'Processando', tone: 'info' },
  PROCESSADO: { label: 'Processado', tone: 'success' },
  ERRO: { label: 'Erro', tone: 'danger' },
  REVISAO_NECESSARIA: { label: 'Revisão necessária', tone: 'warning' },
}

export function AvuImportStatusBadge({ status, className }: { status: AvuImportStatus; className?: string }) {
  const config = STATUS_CONFIG[status]
  return <StatusBadge tone={config.tone} label={config.label} className={className} />
}
