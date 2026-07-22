import { describe, expect, it } from 'vitest'
import { describeConclusao } from './describeConclusao'

describe('describeConclusao', () => {
  it('usa o status atual quando não há decisão de fiscalização', () => {
    expect(describeConclusao(null, 'EM_EXECUCAO')).toBe('Em execução')
    expect(describeConclusao(null, 'NOVO')).toBe('Novo')
  })

  it('usa o rótulo da decisão quando não há comentário', () => {
    expect(describeConclusao({ decision: 'aprovado', comment: null }, 'CONCLUIDO')).toBe('Aprovado')
  })

  it('inclui o comentário do fiscal quando presente', () => {
    expect(describeConclusao({ decision: 'reprovado', comment: 'Cerca ainda com falha no trecho sul' }, 'EM_EXECUCAO')).toBe(
      'Reprovado — Cerca ainda com falha no trecho sul',
    )
  })

  it('formata complementação solicitada', () => {
    expect(describeConclusao({ decision: 'complementacao', comment: null }, 'AGUARDANDO_EVIDENCIAS')).toBe(
      'Complementação solicitada',
    )
  })
})
