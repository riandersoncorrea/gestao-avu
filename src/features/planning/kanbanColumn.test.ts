import { describe, expect, it } from 'vitest'
import { computeKanbanColumn, type KanbanAvu } from './kanbanColumn'

const REFERENCE = new Date('2026-07-21T12:00:00')

function isoDaysFromReference(days: number): string {
  const date = new Date(REFERENCE)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const FUTURE_DATE = isoDaysFromReference(30)
const PAST_DATE = isoDaysFromReference(-5)

function avu(overrides: Partial<KanbanAvu>): KanbanAvu {
  return {
    status: 'NOVO',
    notaSap: null,
    ordemManutencao: null,
    dataLimite: null,
    ...overrides,
  }
}

describe('computeKanbanColumn — pipeline de Nota/OM/prazo (status NOVO/TRIAGEM/PLANEJAMENTO)', () => {
  it('SEM_NOTA quando não há nota_sap', () => {
    expect(computeKanbanColumn(avu({ status: 'NOVO' }), REFERENCE)).toBe('SEM_NOTA')
  })

  it('NOTA_CRIADA quando há nota_sap mas não ordem_manutencao', () => {
    expect(computeKanbanColumn(avu({ status: 'TRIAGEM', notaSap: '123' }), REFERENCE)).toBe('NOTA_CRIADA')
  })

  it('NOTA_MAIS_OM quando tem nota+OM mas status ainda é NOVO/TRIAGEM', () => {
    expect(
      computeKanbanColumn(avu({ status: 'NOVO', notaSap: '123', ordemManutencao: '456' }), REFERENCE),
    ).toBe('NOTA_MAIS_OM')
    expect(
      computeKanbanColumn(avu({ status: 'TRIAGEM', notaSap: '123', ordemManutencao: '456' }), REFERENCE),
    ).toBe('NOTA_MAIS_OM')
  })

  it('OM_SEM_PLANEJAMENTO quando status=PLANEJAMENTO, tem nota+OM mas sem data_limite', () => {
    expect(
      computeKanbanColumn(
        avu({ status: 'PLANEJAMENTO', notaSap: '123', ordemManutencao: '456', dataLimite: null }),
        REFERENCE,
      ),
    ).toBe('OM_SEM_PLANEJAMENTO')
  })

  it('OM_PLANEJADA quando status=PLANEJAMENTO, tem nota+OM e já tem data_limite', () => {
    expect(
      computeKanbanColumn(
        avu({ status: 'PLANEJAMENTO', notaSap: '123', ordemManutencao: '456', dataLimite: FUTURE_DATE }),
        REFERENCE,
      ),
    ).toBe('OM_PLANEJADA')
  })
})

describe('computeKanbanColumn — colunas de status direto', () => {
  it.each([
    ['PROGRAMADO', 'PROGRAMADO'],
    ['EM_EXECUCAO', 'EM_EXECUCAO'],
    ['AGUARDANDO_EVIDENCIAS', 'AGUARDANDO_EVIDENCIAS'],
    ['AGUARDANDO_APROVACAO', 'AGUARDANDO_APROVACAO'],
    ['CONCLUIDO', 'CONCLUIDO'],
  ] as const)('status %s vira a coluna %s', (status, column) => {
    expect(computeKanbanColumn(avu({ status, dataLimite: FUTURE_DATE }), REFERENCE)).toBe(column)
  })
})

describe('computeKanbanColumn — VENCIDO tem precedência', () => {
  it('sobrepõe a coluna natural quando a AVU está atrasada', () => {
    expect(computeKanbanColumn(avu({ status: 'EM_EXECUCAO', dataLimite: PAST_DATE }), REFERENCE)).toBe('VENCIDO')
    expect(
      computeKanbanColumn(
        avu({ status: 'PLANEJAMENTO', notaSap: '1', ordemManutencao: '2', dataLimite: PAST_DATE }),
        REFERENCE,
      ),
    ).toBe('VENCIDO')
  })

  it('não se aplica a CONCLUIDO mesmo com data no passado', () => {
    expect(computeKanbanColumn(avu({ status: 'CONCLUIDO', dataLimite: PAST_DATE }), REFERENCE)).toBe('CONCLUIDO')
  })
})

describe('computeKanbanColumn — fora do quadro', () => {
  it.each(['CANCELADO', 'REPROVADO'] as const)('%s não entra em nenhuma coluna (null)', (status) => {
    expect(computeKanbanColumn(avu({ status }), REFERENCE)).toBeNull()
  })
})
