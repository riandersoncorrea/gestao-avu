import { StatusBadge } from '@/components/StatusBadge'
import type { StatusTone } from '@/types'
import { computeSlaStatus, type SlaTone } from '../sla'
import type { AvuStatus } from '../types'

const TONE_MAP: Record<SlaTone, StatusTone> = {
  no_prazo: 'success',
  proximo_vencimento: 'warning',
  vencido: 'danger',
  encerrado: 'neutral',
}

export function SlaBadge({
  dataLimite,
  status,
  className,
}: {
  dataLimite: string | null
  status: AvuStatus
  className?: string
}) {
  const info = computeSlaStatus(dataLimite, status)
  return <StatusBadge tone={TONE_MAP[info.tone]} label={info.label} className={className} />
}
