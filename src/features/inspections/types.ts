export const APPROVAL_DECISIONS = ['aprovado', 'reprovado', 'complementacao'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export interface AvuApproval {
  id: string
  avuId: string
  fiscalId: string | null
  decision: ApprovalDecision
  comment: string | null
  createdAt: string
}

export const FISCALIZACAO_BUCKETS = [
  'aguardando_aprovacao',
  'aguardando_complementacao',
  'reprovados',
  'aprovados',
] as const
export type FiscalizacaoBucket = (typeof FISCALIZACAO_BUCKETS)[number]
