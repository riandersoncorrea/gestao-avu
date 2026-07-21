import { listAvus } from '@/features/avus/avuService'
import { computeSlaStatus } from '@/features/avus/sla'
import { EMPTY_AVU_FILTERS, type Avu } from '@/features/avus/types'
import type { PortalDashboardStats } from './types'

const PENDENTE_STATUSES = ['NOVO', 'TRIAGEM', 'PLANEJAMENTO', 'PROGRAMADO']

/** Lista as AVUs visíveis para o usuário atual — a RLS (empresa_executante) já restringe
 * à própria contratada, então aqui é só uma leitura sem filtros extras. */
export async function listMyPortalAvus(): Promise<Avu[]> {
  return listAvus(EMPTY_AVU_FILTERS)
}

export function getPortalDashboardStats(avus: Avu[]): PortalDashboardStats {
  let pendentes = 0
  let emExecucao = 0
  let aguardandoEvidencias = 0
  let concluidos = 0
  let vencidos = 0

  for (const avu of avus) {
    if (PENDENTE_STATUSES.includes(avu.status)) pendentes++
    if (avu.status === 'EM_EXECUCAO') emExecucao++
    if (avu.status === 'AGUARDANDO_EVIDENCIAS') aguardandoEvidencias++
    if (avu.status === 'CONCLUIDO') concluidos++
    if (computeSlaStatus(avu.dataLimite, avu.status).tone === 'vencido') vencidos++
  }

  return { total: avus.length, pendentes, emExecucao, aguardandoEvidencias, concluidos, vencidos }
}
