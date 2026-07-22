import { APPROVAL_DECISION_LABELS, type ApprovalDecision } from '@/features/inspections/types'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import type { AvuStatus } from '@/features/avus/types'

export interface LatestApproval {
  decision: ApprovalDecision
  comment: string | null
}

/**
 * "Conclusão" do laudo: a última decisão de fiscalização registrada (com o comentário do
 * fiscal, se houver) — ou, se a AVU nunca passou por fiscalização, o status atual como
 * fallback (ex.: uma AVU ainda em execução não tem "conclusão" de verdade ainda).
 */
export function describeConclusao(latestApproval: LatestApproval | null, status: AvuStatus): string {
  if (!latestApproval) return avuStatusLabel(status)

  const label = APPROVAL_DECISION_LABELS[latestApproval.decision]
  return latestApproval.comment ? `${label} — ${latestApproval.comment}` : label
}
