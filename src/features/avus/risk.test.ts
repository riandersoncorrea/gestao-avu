import { describe, expect, it } from 'vitest'
import { computeRiskLevel, daysSince, deriveAvuRisk } from './risk'
import type { Avu } from './types'

describe('daysSince', () => {
  it('returns 0 for a date at the reference instant', () => {
    const ref = new Date('2026-07-21T12:00:00')
    expect(daysSince('2026-07-21T12:00:00', ref)).toBe(0)
  })

  it('returns the number of whole days elapsed', () => {
    const ref = new Date('2026-07-21T12:00:00')
    expect(daysSince('2026-07-01T12:00:00', ref)).toBe(20)
  })
})

describe('computeRiskLevel', () => {
  it('is always "baixo" for terminal statuses, regardless of other inputs', () => {
    for (const status of ['CONCLUIDO', 'REPROVADO', 'CANCELADO'] as const) {
      const info = computeRiskLevel({
        slaTone: 'vencido',
        prioridade: 'CRITICA',
        status,
        daysInCurrentStatus: 90,
      })
      expect(info.level).toBe('baixo')
    }
  })

  it('is "baixo" with no aggravating factors', () => {
    const info = computeRiskLevel({
      slaTone: 'no_prazo',
      prioridade: 'BAIXA',
      status: 'EM_EXECUCAO',
      daysInCurrentStatus: 1,
    })
    expect(info.level).toBe('baixo')
    expect(info.score).toBe(0)
  })

  it('is "medio" when only overdue-soon applies', () => {
    const info = computeRiskLevel({
      slaTone: 'proximo_vencimento',
      prioridade: 'MEDIA',
      status: 'EM_EXECUCAO',
      daysInCurrentStatus: 1,
    })
    expect(info.level).toBe('medio')
    expect(info.score).toBe(2)
  })

  it('is "alto" when overdue and high priority combine', () => {
    const info = computeRiskLevel({
      slaTone: 'vencido',
      prioridade: 'ALTA',
      status: 'PROGRAMADO',
      daysInCurrentStatus: 1,
    })
    expect(info.level).toBe('alto')
    expect(info.score).toBe(4)
  })

  it('is "critico" when overdue, critical priority, and stuck for a long time all combine', () => {
    const info = computeRiskLevel({
      slaTone: 'vencido',
      prioridade: 'CRITICA',
      status: 'PLANEJAMENTO',
      daysInCurrentStatus: 45,
    })
    expect(info.level).toBe('critico')
    expect(info.score).toBe(7)
  })

  it('adds partial points for being stuck between 14 and 30 days', () => {
    const info = computeRiskLevel({
      slaTone: 'no_prazo',
      prioridade: 'BAIXA',
      status: 'TRIAGEM',
      daysInCurrentStatus: 20,
    })
    expect(info.score).toBe(1)
    expect(info.level).toBe('baixo')
  })
})

describe('deriveAvuRisk', () => {
  const REFERENCE = new Date('2026-07-21T12:00:00')

  function pickAvu(overrides: Partial<Avu>): Pick<Avu, 'dataLimite' | 'status' | 'prioridade' | 'statusSince'> {
    return {
      dataLimite: null,
      status: 'EM_EXECUCAO',
      prioridade: 'MEDIA',
      statusSince: null,
      ...overrides,
    }
  }

  it('treats a null statusSince as 0 days stuck', () => {
    const info = deriveAvuRisk(pickAvu({ statusSince: null }), REFERENCE)
    expect(info.level).toBe('baixo')
  })

  it('wires an overdue dataLimite through to the SLA-driven score', () => {
    const info = deriveAvuRisk(
      pickAvu({ dataLimite: '2026-07-01', statusSince: '2026-07-20T12:00:00' }),
      REFERENCE,
    )
    expect(info.score).toBeGreaterThanOrEqual(3)
  })
})
