import { computeSlaStatus } from '@/features/avus/sla'
import type { Avu, AvuStatus } from '@/features/avus/types'

export const MARKER_COLOR_KEYS = [
  'sem_planejamento',
  'programado',
  'em_execucao',
  'concluido',
  'atrasado',
  'proximo_vencimento',
] as const
export type MarkerColorKey = (typeof MARKER_COLOR_KEYS)[number]

export interface MarkerColorInfo {
  key: MarkerColorKey
  color: string
  label: string
}

export const MARKER_COLORS: Record<MarkerColorKey, MarkerColorInfo> = {
  sem_planejamento: { key: 'sem_planejamento', color: '#9ca3af', label: 'Sem planejamento' },
  programado: { key: 'programado', color: '#3b82f6', label: 'Programado' },
  em_execucao: { key: 'em_execucao', color: '#f97316', label: 'Em execução' },
  concluido: { key: 'concluido', color: '#22c55e', label: 'Concluído' },
  atrasado: { key: 'atrasado', color: '#ef4444', label: 'Atrasado' },
  proximo_vencimento: { key: 'proximo_vencimento', color: '#eab308', label: 'Próximo do vencimento' },
}

const EM_EXECUCAO_STATUSES: AvuStatus[] = ['EM_EXECUCAO', 'AGUARDANDO_EVIDENCIAS', 'AGUARDANDO_APROVACAO']
const SEM_PLANEJAMENTO_STATUSES: AvuStatus[] = ['NOVO', 'TRIAGEM', 'PLANEJAMENTO']
const EXCLUDED_STATUSES: AvuStatus[] = ['CANCELADO', 'REPROVADO']

/**
 * Cor do marcador no mapa de vulnerabilidades — uma AVU só tem uma cor, mesmo quando bate
 * em mais de um critério (ex.: Programado E vencida). Precedência: Concluído sempre vence
 * (nunca é vencido/próximo — `computeSlaStatus` já retorna `encerrado` pra status terminal);
 * depois SLA vencido/próximo tem prioridade sobre o status bruto (é a informação mais
 * urgente num mapa de vulnerabilidades); Cancelado/Reprovado não têm cor — não aparecem
 * no mapa (continuam na tabela).
 */
export function computeMarkerColor(
  avu: Pick<Avu, 'status' | 'dataLimite'>,
  referenceDate: Date = new Date(),
): MarkerColorInfo | null {
  if (EXCLUDED_STATUSES.includes(avu.status)) return null
  if (avu.status === 'CONCLUIDO') return MARKER_COLORS.concluido

  const sla = computeSlaStatus(avu.dataLimite, avu.status, referenceDate)
  if (sla.tone === 'vencido') return MARKER_COLORS.atrasado
  if (sla.tone === 'proximo_vencimento') return MARKER_COLORS.proximo_vencimento

  if (EM_EXECUCAO_STATUSES.includes(avu.status)) return MARKER_COLORS.em_execucao
  if (avu.status === 'PROGRAMADO') return MARKER_COLORS.programado
  if (SEM_PLANEJAMENTO_STATUSES.includes(avu.status)) return MARKER_COLORS.sem_planejamento

  return null
}
