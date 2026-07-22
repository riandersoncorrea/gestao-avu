import { describe, expect, it } from 'vitest'
import type { AvuStatus } from '@/features/avus/types'
import { computeMarkerColor } from './markerColor'

const REFERENCE = new Date('2026-07-21T12:00:00')

describe('computeMarkerColor', () => {
  it.each<[AvuStatus, string]>([
    ['NOVO', 'sem_planejamento'],
    ['TRIAGEM', 'sem_planejamento'],
    ['PLANEJAMENTO', 'sem_planejamento'],
    ['PROGRAMADO', 'programado'],
    ['EM_EXECUCAO', 'em_execucao'],
    ['AGUARDANDO_EVIDENCIAS', 'em_execucao'],
    ['AGUARDANDO_APROVACAO', 'em_execucao'],
    ['CONCLUIDO', 'concluido'],
  ])('%s sem prazo vencido/próximo -> %s', (status, expectedKey) => {
    const color = computeMarkerColor({ status, dataLimite: '2027-01-01' }, REFERENCE)
    expect(color?.key).toBe(expectedKey)
  })

  it.each<AvuStatus>(['CANCELADO', 'REPROVADO'])('%s não tem cor (excluída do mapa)', (status) => {
    expect(computeMarkerColor({ status, dataLimite: null }, REFERENCE)).toBeNull()
  })

  it('SLA vencido tem precedência sobre o status bruto (Programado vencido -> atrasado, não azul)', () => {
    const color = computeMarkerColor({ status: 'PROGRAMADO', dataLimite: '2026-01-01' }, REFERENCE)
    expect(color?.key).toBe('atrasado')
  })

  it('SLA vencido tem precedência sobre Em execução também', () => {
    const color = computeMarkerColor({ status: 'EM_EXECUCAO', dataLimite: '2026-01-01' }, REFERENCE)
    expect(color?.key).toBe('atrasado')
  })

  it('SLA próximo do vencimento tem precedência sobre o status bruto', () => {
    const color = computeMarkerColor({ status: 'PROGRAMADO', dataLimite: '2026-07-22' }, REFERENCE)
    expect(color?.key).toBe('proximo_vencimento')
  })

  it('Concluído nunca aparece como atrasado, mesmo com prazo no passado (SLA terminal = encerrado)', () => {
    const color = computeMarkerColor({ status: 'CONCLUIDO', dataLimite: '2020-01-01' }, REFERENCE)
    expect(color?.key).toBe('concluido')
  })

  it('sem prazo definido, não vencido/próximo — usa o status bruto', () => {
    const color = computeMarkerColor({ status: 'EM_EXECUCAO', dataLimite: null }, REFERENCE)
    expect(color?.key).toBe('em_execucao')
  })
})
