import { computeSlaStatus } from '@/features/avus/sla'
import type { Avu } from '@/features/avus/types'

export const KANBAN_COLUMNS = [
  'SEM_NOTA',
  'NOTA_CRIADA',
  'NOTA_MAIS_OM',
  'OM_SEM_PLANEJAMENTO',
  'OM_PLANEJADA',
  'PROGRAMADO',
  'EM_EXECUCAO',
  'AGUARDANDO_EVIDENCIAS',
  'AGUARDANDO_APROVACAO',
  'CONCLUIDO',
  'VENCIDO',
] as const

export type KanbanColumnKey = (typeof KANBAN_COLUMNS)[number]

export const KANBAN_COLUMN_LABELS: Record<KanbanColumnKey, string> = {
  SEM_NOTA: 'Sem Nota',
  NOTA_CRIADA: 'Nota Criada',
  NOTA_MAIS_OM: 'Nota + OM',
  OM_SEM_PLANEJAMENTO: 'OM sem Planejamento',
  OM_PLANEJADA: 'OM Planejada',
  PROGRAMADO: 'Programado',
  EM_EXECUCAO: 'Em Execução',
  AGUARDANDO_EVIDENCIAS: 'Aguardando Evidências',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  CONCLUIDO: 'Concluído',
  VENCIDO: 'Vencido',
}

export type KanbanAvu = Pick<Avu, 'status' | 'notaSap' | 'ordemManutencao' | 'dataLimite'>

/**
 * Deriva a coluna do Kanban de Planejamento. Não é um campo no banco — combina
 * `status` com a presença de nota_sap/ordem_manutencao/data_limite (interpretação
 * confirmada com o usuário). CANCELADO/REPROVADO ficam fora do quadro (null) —
 * só aparecem na visão Tabela. VENCIDO tem precedência sobre a coluna "natural"
 * do status sempre que a AVU está atrasada e ainda não terminou.
 */
export function computeKanbanColumn(avu: KanbanAvu, referenceDate: Date = new Date()): KanbanColumnKey | null {
  if (avu.status === 'CANCELADO' || avu.status === 'REPROVADO') return null
  if (avu.status === 'CONCLUIDO') return 'CONCLUIDO'

  const sla = computeSlaStatus(avu.dataLimite, avu.status, referenceDate)
  if (sla.tone === 'vencido') return 'VENCIDO'

  if (avu.status === 'AGUARDANDO_APROVACAO') return 'AGUARDANDO_APROVACAO'
  if (avu.status === 'AGUARDANDO_EVIDENCIAS') return 'AGUARDANDO_EVIDENCIAS'
  if (avu.status === 'EM_EXECUCAO') return 'EM_EXECUCAO'
  if (avu.status === 'PROGRAMADO') return 'PROGRAMADO'

  // status NOVO, TRIAGEM ou PLANEJAMENTO — refina pela pipeline Nota SAP → OM → prazo.
  if (!avu.notaSap) return 'SEM_NOTA'
  if (!avu.ordemManutencao) return 'NOTA_CRIADA'

  if (avu.status === 'PLANEJAMENTO') {
    return avu.dataLimite ? 'OM_PLANEJADA' : 'OM_SEM_PLANEJAMENTO'
  }

  return 'NOTA_MAIS_OM'
}
