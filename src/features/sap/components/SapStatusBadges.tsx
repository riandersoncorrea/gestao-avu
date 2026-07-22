import { StatusBadge } from '@/components/StatusBadge'
import type { StatusTone } from '@/types'
import type { SapImportStatus, SapRecordMatchStatus } from '../types'

const IMPORT_STATUS_CONFIG: Record<SapImportStatus, { label: string; tone: StatusTone }> = {
  PROCESSANDO: { label: 'Processando', tone: 'info' },
  PROCESSADO: { label: 'Processado', tone: 'success' },
  ERRO: { label: 'Erro', tone: 'danger' },
}

export function SapImportStatusBadge({ status, className }: { status: SapImportStatus; className?: string }) {
  const config = IMPORT_STATUS_CONFIG[status]
  return <StatusBadge tone={config.tone} label={config.label} className={className} />
}

const MATCH_STATUS_CONFIG: Record<SapRecordMatchStatus, { label: string; tone: StatusTone }> = {
  RELACIONADO: { label: 'Relacionado', tone: 'success' },
  AVU_NAO_ENCONTRADO: { label: 'AVU não encontrado', tone: 'warning' },
  DUPLICADO: { label: 'Duplicado', tone: 'neutral' },
  ERRO: { label: 'Erro', tone: 'danger' },
}

export function SapRecordMatchStatusBadge({ status, className }: { status: SapRecordMatchStatus; className?: string }) {
  const config = MATCH_STATUS_CONFIG[status]
  return <StatusBadge tone={config.tone} label={config.label} className={className} />
}

export function sapRecordMatchStatusLabel(status: SapRecordMatchStatus): string {
  return MATCH_STATUS_CONFIG[status].label
}
