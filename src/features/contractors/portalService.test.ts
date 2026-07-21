import { describe, expect, it } from 'vitest'
import type { Avu, AvuStatus } from '@/features/avus/types'
import { getPortalDashboardStats } from './portalService'

function makeAvu(status: AvuStatus, dataLimite: string | null = null): Avu {
  return {
    id: crypto.randomUUID(),
    numeroAvu: 'AVU-0001',
    dataCriacao: '2026-01-01',
    gerenciaResponsavel: null,
    dataLimite,
    emitente: null,
    projeto: null,
    local: null,
    latitude: null,
    longitude: null,
    descricao: 'Teste',
    categoria: null,
    subcategoria: null,
    nivelConfiancaIa: null,
    status,
    prioridade: 'MEDIA',
    responsavel: null,
    empresaExecutante: 'Empresa X',
    fiscal: null,
    notaSap: null,
    ordemManutencao: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    statusSince: null,
  }
}

describe('getPortalDashboardStats', () => {
  it('classifies each AVU into a single KPI bucket', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 5)
    const overdueDate = yesterday.toISOString().slice(0, 10)

    const avus: Avu[] = [
      makeAvu('NOVO'),
      makeAvu('TRIAGEM'),
      makeAvu('PLANEJAMENTO'),
      makeAvu('PROGRAMADO'),
      makeAvu('EM_EXECUCAO'),
      makeAvu('AGUARDANDO_EVIDENCIAS'),
      makeAvu('CONCLUIDO'),
      makeAvu('EM_EXECUCAO', overdueDate),
    ]

    const stats = getPortalDashboardStats(avus)

    expect(stats.total).toBe(8)
    expect(stats.pendentes).toBe(4)
    expect(stats.emExecucao).toBe(2)
    expect(stats.aguardandoEvidencias).toBe(1)
    expect(stats.concluidos).toBe(1)
    expect(stats.vencidos).toBe(1)
  })

  it('returns all zeros for an empty list', () => {
    expect(getPortalDashboardStats([])).toEqual({
      total: 0,
      pendentes: 0,
      emExecucao: 0,
      aguardandoEvidencias: 0,
      concluidos: 0,
      vencidos: 0,
    })
  })
})
