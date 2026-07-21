import { StatusBadge } from '@/components/StatusBadge'
import type { StatusTone } from '@/types'
import { deriveAvuRisk, type RiskLevel } from '../risk'
import type { Avu } from '../types'

const RISK_TONE: Record<RiskLevel, StatusTone> = {
  baixo: 'success',
  medio: 'warning',
  alto: 'danger',
  critico: 'danger',
}

export function RiskBadge({
  avu,
  className,
}: {
  avu: Pick<Avu, 'dataLimite' | 'status' | 'prioridade' | 'statusSince'>
  className?: string
}) {
  const risk = deriveAvuRisk(avu)
  return <StatusBadge tone={RISK_TONE[risk.level]} label={`Risco ${risk.label}`} className={className} />
}
