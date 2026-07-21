import { describe, expect, it } from 'vitest'
import { AVU_STATUSES, type AvuStatus } from '@/features/avus/types'
import { getPlanningNextStatuses, getValidNextStatuses, isValidTransition } from './transitions'

describe('isValidTransition — caminho feliz', () => {
  const HAPPY_PATH: [AvuStatus, AvuStatus][] = [
    ['NOVO', 'TRIAGEM'],
    ['TRIAGEM', 'PLANEJAMENTO'],
    ['PLANEJAMENTO', 'PROGRAMADO'],
    ['PROGRAMADO', 'EM_EXECUCAO'],
    ['EM_EXECUCAO', 'AGUARDANDO_EVIDENCIAS'],
    ['AGUARDANDO_EVIDENCIAS', 'AGUARDANDO_APROVACAO'],
    ['AGUARDANDO_APROVACAO', 'CONCLUIDO'],
  ]

  it.each(HAPPY_PATH)('%s → %s é válida', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true)
  })
})

describe('isValidTransition — ramificações', () => {
  it('EM_EXECUCAO → AGUARDANDO_APROVACAO é válida (Contratada envia evidência sem esperar alguém marcar AGUARDANDO_EVIDENCIAS antes)', () => {
    expect(isValidTransition('EM_EXECUCAO', 'AGUARDANDO_APROVACAO')).toBe(true)
  })

  it('AGUARDANDO_APROVACAO → REPROVADO é válida', () => {
    expect(isValidTransition('AGUARDANDO_APROVACAO', 'REPROVADO')).toBe(true)
  })

  it('AGUARDANDO_APROVACAO → EM_EXECUCAO é válida (Fiscal reprova, volta direto pra execução)', () => {
    expect(isValidTransition('AGUARDANDO_APROVACAO', 'EM_EXECUCAO')).toBe(true)
  })

  it('AGUARDANDO_APROVACAO → AGUARDANDO_EVIDENCIAS é válida (Fiscal solicita complementação)', () => {
    expect(isValidTransition('AGUARDANDO_APROVACAO', 'AGUARDANDO_EVIDENCIAS')).toBe(true)
  })

  it('REPROVADO → EM_EXECUCAO é válida (retrabalho)', () => {
    expect(isValidTransition('REPROVADO', 'EM_EXECUCAO')).toBe(true)
  })

  it.each(AVU_STATUSES.filter((s) => !['CONCLUIDO', 'CANCELADO'].includes(s)))(
    '%s → CANCELADO é válida',
    (from) => {
      expect(isValidTransition(from, 'CANCELADO')).toBe(true)
    },
  )
})

describe('isValidTransition — transições inválidas', () => {
  it('não permite pular etapas (NOVO → CONCLUIDO)', () => {
    expect(isValidTransition('NOVO', 'CONCLUIDO')).toBe(false)
  })

  it('não permite pular etapas (TRIAGEM → PROGRAMADO)', () => {
    expect(isValidTransition('TRIAGEM', 'PROGRAMADO')).toBe(false)
  })

  it('não permite voltar no fluxo linear (EM_EXECUCAO → PLANEJAMENTO)', () => {
    expect(isValidTransition('EM_EXECUCAO', 'PLANEJAMENTO')).toBe(false)
  })

  it.each(['CONCLUIDO', 'CANCELADO'] as const)('status terminal %s não tem nenhuma transição válida', (status) => {
    expect(getValidNextStatuses(status)).toEqual([])
  })
})

describe('getPlanningNextStatuses', () => {
  it('exclui os alvos reservados a Fiscal/Contratada', () => {
    expect(getPlanningNextStatuses('AGUARDANDO_EVIDENCIAS')).toEqual(['CANCELADO'])
    // AGUARDANDO_APROVACAO → CANCELADO continua disponível (não é reservado); todo o
    // resto (CONCLUIDO/REPROVADO/EM_EXECUCAO/AGUARDANDO_EVIDENCIAS) são as decisões do
    // fiscal (avu_review_evidence), não da ação genérica de planejamento.
    expect(getPlanningNextStatuses('AGUARDANDO_APROVACAO')).toEqual(['CANCELADO'])
  })

  it('mantém as transições normais do fluxo de planejamento', () => {
    expect(getPlanningNextStatuses('NOVO')).toEqual(['TRIAGEM', 'CANCELADO'])
    expect(getPlanningNextStatuses('REPROVADO')).toEqual(['EM_EXECUCAO', 'CANCELADO'])
    // EM_EXECUCAO → AGUARDANDO_EVIDENCIAS continua disponível pro planejamento normalmente —
    // só fica reservado ao Fiscal quando a ORIGEM é AGUARDANDO_APROVACAO, não aqui.
    expect(getPlanningNextStatuses('EM_EXECUCAO')).toEqual(['AGUARDANDO_EVIDENCIAS', 'CANCELADO'])
  })
})
