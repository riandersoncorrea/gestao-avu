import type { AvuStatus } from '@/features/avus/types'

/**
 * Espelha o grafo de `avu_status_transitions` (supabase/migrations/0004_workflow_and_planning.sql)
 * só para a UI saber quais opções mostrar — a validação de verdade é o trigger
 * `avus_validate_status_transition` no Postgres. Se o grafo mudar no banco, atualizar aqui também.
 */
export const STATUS_TRANSITIONS: Record<AvuStatus, AvuStatus[]> = {
  NOVO: ['TRIAGEM', 'CANCELADO'],
  TRIAGEM: ['PLANEJAMENTO', 'CANCELADO'],
  PLANEJAMENTO: ['PROGRAMADO', 'CANCELADO'],
  PROGRAMADO: ['EM_EXECUCAO', 'CANCELADO'],
  EM_EXECUCAO: ['AGUARDANDO_EVIDENCIAS', 'CANCELADO'],
  AGUARDANDO_EVIDENCIAS: ['AGUARDANDO_APROVACAO', 'CANCELADO'],
  AGUARDANDO_APROVACAO: ['CONCLUIDO', 'REPROVADO', 'CANCELADO'],
  REPROVADO: ['EM_EXECUCAO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
}

/**
 * Transições reservadas às RPCs de Fiscal/Contratada (avu_review_execution/avu_submit_evidence).
 * A RPC genérica avu_transition_status rejeita esses alvos para quem não é admin — a UI
 * usa isto para não oferecer a opção de "avançar status" genérica para esses destinos.
 */
export const RESERVED_TRANSITION_TARGETS: AvuStatus[] = ['AGUARDANDO_APROVACAO', 'CONCLUIDO', 'REPROVADO']

export function isValidTransition(from: AvuStatus, to: AvuStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

export function getValidNextStatuses(from: AvuStatus): AvuStatus[] {
  return STATUS_TRANSITIONS[from]
}

/** Próximos status alcançáveis pela ação genérica de planejamento (exclui os reservados a Fiscal/Contratada). */
export function getPlanningNextStatuses(from: AvuStatus): AvuStatus[] {
  return getValidNextStatuses(from).filter((status) => !RESERVED_TRANSITION_TARGETS.includes(status))
}
