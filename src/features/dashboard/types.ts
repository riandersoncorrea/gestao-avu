import type { Avu, AvuStatus } from '@/features/avus/types'

export interface DashboardFilters {
  periodoInicio: string
  periodoFim: string
  gerenciaResponsavel: string
  categoria: string
  status: AvuStatus | ''
  projeto: string
  local: string
  empresaExecutante: string
  responsavelId: string
  emitenteId: string
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = {
  periodoInicio: '',
  periodoFim: '',
  gerenciaResponsavel: '',
  categoria: '',
  status: '',
  projeto: '',
  local: '',
  empresaExecutante: '',
  responsavelId: '',
  emitenteId: '',
}

/** Avu + os campos derivados de `avu_dashboard_view` (status_since já existe em Avu; data_conclusao é novo). */
export interface DashboardAvu extends Avu {
  dataConclusao: string | null
}

export const DASHBOARD_BUCKETS = [
  'pendentes',
  'programados',
  'em_execucao',
  'concluidos',
  'sem_planejamento',
  'vencidos',
  'proximos_vencimento',
] as const
export type DashboardBucket = (typeof DASHBOARD_BUCKETS)[number]
