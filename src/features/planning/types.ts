import type { AvuFilters, AvuPriority } from '@/features/avus/types'
import type { RiskLevel } from '@/features/avus/risk'
import type { SlaTone } from '@/features/avus/sla'
import type { KanbanColumnKey } from './kanbanColumn'

export interface PlanningFilters extends AvuFilters {
  prioridade: AvuPriority | ''
  risco: RiskLevel | ''
  coluna: KanbanColumnKey | ''
  slaTone: SlaTone | ''
}

export const EMPTY_PLANNING_FILTERS: PlanningFilters = {
  search: '',
  status: '',
  categoria: '',
  gerenciaResponsavel: '',
  projeto: '',
  local: '',
  empresaExecutante: '',
  responsavelId: '',
  periodoInicio: '',
  periodoFim: '',
  prioridade: '',
  risco: '',
  coluna: '',
  slaTone: '',
}

export interface PlanningFieldsUpdate {
  notaSap?: string | null
  ordemManutencao?: string | null
  dataLimite?: string | null
  prioridade?: AvuPriority
}
