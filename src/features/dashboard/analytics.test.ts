import { describe, expect, it } from 'vitest'
import type { AvuStatus } from '@/features/avus/types'
import type { DashboardAvu } from './types'
import {
  avuMatchesBucket,
  computeAverageCycleTimeByGroup,
  computeAverageCycleTimeDays,
  computeCriticalAreasRanking,
  computeHeatmapPoints,
  computeKpis,
  computeTemporalSeries,
  groupCount,
} from './analytics'

const REFERENCE = new Date('2026-07-21T12:00:00')

function makeAvu(overrides: Partial<DashboardAvu> = {}): DashboardAvu {
  return {
    id: crypto.randomUUID(),
    numeroAvu: 'AVU-0001',
    dataCriacao: '2026-01-01',
    gerenciaResponsavel: null,
    dataLimite: null,
    emitente: null,
    projeto: null,
    local: null,
    latitude: null,
    longitude: null,
    descricao: 'Teste',
    categoria: null,
    subcategoria: null,
    nivelConfiancaIa: null,
    status: 'NOVO',
    prioridade: 'MEDIA',
    responsavel: null,
    empresaExecutante: null,
    fiscal: null,
    notaSap: null,
    ordemManutencao: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    statusSince: '2026-01-01T00:00:00Z',
    dataConclusao: null,
    ...overrides,
  }
}

describe('avuMatchesBucket', () => {
  it.each<[AvuStatus, boolean]>([
    ['NOVO', true],
    ['TRIAGEM', true],
    ['PLANEJAMENTO', true],
    ['PROGRAMADO', false],
    ['EM_EXECUCAO', false],
  ])('pendentes: %s -> %s', (status, expected) => {
    expect(avuMatchesBucket(makeAvu({ status }), 'pendentes')).toBe(expected)
  })

  it('programados só bate com status PROGRAMADO', () => {
    expect(avuMatchesBucket(makeAvu({ status: 'PROGRAMADO' }), 'programados')).toBe(true)
    expect(avuMatchesBucket(makeAvu({ status: 'EM_EXECUCAO' }), 'programados')).toBe(false)
  })

  it('em_execucao só bate com status EM_EXECUCAO', () => {
    expect(avuMatchesBucket(makeAvu({ status: 'EM_EXECUCAO' }), 'em_execucao')).toBe(true)
    expect(avuMatchesBucket(makeAvu({ status: 'PROGRAMADO' }), 'em_execucao')).toBe(false)
  })

  it('concluidos só bate com status CONCLUIDO', () => {
    expect(avuMatchesBucket(makeAvu({ status: 'CONCLUIDO' }), 'concluidos')).toBe(true)
    expect(avuMatchesBucket(makeAvu({ status: 'EM_EXECUCAO' }), 'concluidos')).toBe(false)
  })

  describe('sem_planejamento', () => {
    it('bate quando status ativo e falta nota_sap ou ordem_manutencao', () => {
      expect(avuMatchesBucket(makeAvu({ status: 'TRIAGEM', notaSap: null, ordemManutencao: null }), 'sem_planejamento')).toBe(true)
      expect(avuMatchesBucket(makeAvu({ status: 'TRIAGEM', notaSap: 'N1', ordemManutencao: null }), 'sem_planejamento')).toBe(true)
    })

    it('não bate quando tem nota_sap e ordem_manutencao', () => {
      expect(
        avuMatchesBucket(makeAvu({ status: 'TRIAGEM', notaSap: 'N1', ordemManutencao: 'OM1' }), 'sem_planejamento'),
      ).toBe(false)
    })

    it('não bate para status terminal, mesmo sem nota/OM', () => {
      expect(avuMatchesBucket(makeAvu({ status: 'CONCLUIDO', notaSap: null }), 'sem_planejamento')).toBe(false)
      expect(avuMatchesBucket(makeAvu({ status: 'CANCELADO', notaSap: null }), 'sem_planejamento')).toBe(false)
    })
  })

  describe('vencidos / proximos_vencimento (via SLA)', () => {
    it('vencidos bate quando o prazo já passou', () => {
      const avu = makeAvu({ status: 'EM_EXECUCAO', dataLimite: '2026-07-01' })
      expect(avuMatchesBucket(avu, 'vencidos', REFERENCE)).toBe(true)
      expect(avuMatchesBucket(avu, 'proximos_vencimento', REFERENCE)).toBe(false)
    })

    it('proximos_vencimento bate quando o prazo está próximo (dentro da janela de aviso)', () => {
      const avu = makeAvu({ status: 'EM_EXECUCAO', dataLimite: '2026-07-22' })
      expect(avuMatchesBucket(avu, 'proximos_vencimento', REFERENCE)).toBe(true)
      expect(avuMatchesBucket(avu, 'vencidos', REFERENCE)).toBe(false)
    })
  })
})

describe('computeKpis', () => {
  it('conta cada bucket corretamente sobre uma lista mista', () => {
    const avus = [
      makeAvu({ status: 'NOVO' }),
      makeAvu({ status: 'TRIAGEM' }),
      makeAvu({ status: 'PROGRAMADO' }),
      makeAvu({ status: 'EM_EXECUCAO' }),
      makeAvu({ status: 'CONCLUIDO' }),
      makeAvu({ status: 'EM_EXECUCAO', dataLimite: '2026-01-01' }), // vencida
    ]

    const kpis = computeKpis(avus, REFERENCE)

    expect(kpis.total).toBe(6)
    expect(kpis.pendentes).toBe(2)
    expect(kpis.programados).toBe(1)
    expect(kpis.emExecucao).toBe(2)
    expect(kpis.concluidos).toBe(1)
    expect(kpis.vencidos).toBe(1)
  })
})

describe('computeAverageCycleTimeDays', () => {
  it('retorna null quando nenhuma AVU foi concluída', () => {
    expect(computeAverageCycleTimeDays([makeAvu({ dataConclusao: null })])).toBeNull()
  })

  it('calcula a média de dias entre dataCriacao e dataConclusao', () => {
    const avus = [
      makeAvu({ dataCriacao: '2026-01-01', dataConclusao: '2026-01-11T00:00:00Z' }), // 10 dias
      makeAvu({ dataCriacao: '2026-01-01', dataConclusao: '2026-01-21T00:00:00Z' }), // 20 dias
    ]
    expect(computeAverageCycleTimeDays(avus)).toBe(15)
  })
})

describe('computeAverageCycleTimeByGroup', () => {
  it('agrupa por gerência e ordena do maior tempo médio pro menor', () => {
    const avus = [
      makeAvu({ gerenciaResponsavel: 'Manutenção', dataCriacao: '2026-01-01', dataConclusao: '2026-01-06T00:00:00Z' }), // 5d
      makeAvu({ gerenciaResponsavel: 'Operações', dataCriacao: '2026-01-01', dataConclusao: '2026-01-21T00:00:00Z' }), // 20d
      makeAvu({ gerenciaResponsavel: null, dataCriacao: '2026-01-01', dataConclusao: '2026-01-31T00:00:00Z' }), // sem gerência, ignorado
    ]
    const result = computeAverageCycleTimeByGroup(avus, (avu) => avu.gerenciaResponsavel)
    expect(result).toEqual([
      { key: 'Operações', avgDays: 20, count: 1 },
      { key: 'Manutenção', avgDays: 5, count: 1 },
    ])
  })
})

describe('groupCount', () => {
  it('ordena desc e corta em topN', () => {
    const avus = [
      makeAvu({ categoria: 'Elétrica' }),
      makeAvu({ categoria: 'Elétrica' }),
      makeAvu({ categoria: 'Mecânica' }),
      makeAvu({ categoria: 'Civil' }),
    ]
    const result = groupCount(avus, (avu) => avu.categoria, 2)
    expect(result).toEqual([
      { key: 'Elétrica', count: 2 },
      { key: 'Mecânica', count: 1 },
    ])
  })

  it('ignora avus sem valor na dimensão', () => {
    const avus = [makeAvu({ categoria: null }), makeAvu({ categoria: 'Elétrica' })]
    expect(groupCount(avus, (avu) => avu.categoria)).toEqual([{ key: 'Elétrica', count: 1 }])
  })
})

describe('computeCriticalAreasRanking', () => {
  it('ordena gerências pela quantidade de AVUs de risco alto/crítico', () => {
    const avus = [
      makeAvu({
        gerenciaResponsavel: 'Manutenção',
        status: 'EM_EXECUCAO',
        prioridade: 'CRITICA',
        dataLimite: '2026-01-01', // vencida
        statusSince: '2025-01-01T00:00:00Z', // parada há muito tempo
      }),
      makeAvu({ gerenciaResponsavel: 'Operações', status: 'EM_EXECUCAO', prioridade: 'BAIXA', dataLimite: '2027-01-01' }),
    ]
    const ranking = computeCriticalAreasRanking(avus, REFERENCE)
    expect(ranking[0].area).toBe('Manutenção')
    expect(ranking[0].criticalCount).toBe(1)
  })
})

describe('computeTemporalSeries', () => {
  it('agrupa por mês nos últimos N meses', () => {
    const avus = [makeAvu({ dataCriacao: '2026-07-05' }), makeAvu({ dataCriacao: '2026-07-15' }), makeAvu({ dataCriacao: '2026-06-01' })]
    const series = computeTemporalSeries(avus, 3, REFERENCE)
    expect(series).toHaveLength(3)
    expect(series[series.length - 1].count).toBe(2) // mês de referência (julho)
    expect(series[series.length - 2].count).toBe(1) // junho
  })
})

describe('computeHeatmapPoints', () => {
  it('só inclui AVUs com latitude e longitude preenchidas', () => {
    const avus = [
      makeAvu({ latitude: -2.5, longitude: -44.3 }),
      makeAvu({ latitude: null, longitude: null }),
    ]
    expect(computeHeatmapPoints(avus)).toEqual([{ longitude: -44.3, latitude: -2.5 }])
  })
})
