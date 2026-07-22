import { describe, expect, it } from 'vitest'
import { classifyDescricao } from './classify'

const CONFIDENCE_THRESHOLD = 80

describe('classifyDescricao (HeuristicAIProvider)', () => {
  it('classifica um caso claro de manutenção hidráulica', () => {
    const result = classifyDescricao('Vazamento na tubulação hidráulica do pátio principal.')
    expect(result.categoria).toBe('MANUTENÇÃO')
    expect(result.subcategoria).toBe('Hidráulica')
  })

  it('classifica um caso claro de iluminação', () => {
    const result = classifyDescricao('Lâmpada do poste 12 queimada, iluminação da rua escura à noite.')
    expect(result.categoria).toBe('ILUMINAÇÃO')
  })

  it('classifica um caso claro de áreas verdes', () => {
    const result = classifyDescricao('Poda necessária na árvore do jardim próximo ao estacionamento.')
    expect(result.categoria).toBe('ÁREAS VERDES')
  })

  it('cai em OUTROS/Geral quando nenhuma palavra-chave bate', () => {
    const result = classifyDescricao('Situação incomum sem relação clara com nenhuma categoria conhecida.')
    expect(result.categoria).toBe('OUTROS')
    expect(result.subcategoria).toBe('Geral')
  })

  it('nunca ultrapassa o teto de confiança do classificador heurístico (é honestamente limitado)', () => {
    // Descrição com muitas palavras-chave de propósito, pra tentar "forçar" confiança alta.
    const result = classifyDescricao(
      'Vazamento hidráulica tubulação estrutura estrutural trinca rachadura corrosão manutenção reparo',
    )
    expect(result.confianca).toBeLessThan(CONFIDENCE_THRESHOLD)
  })

  it('confiança abaixo do limiar de 80% deve exigir REVISAO_NECESSARIA (regra de negócio validada aqui)', () => {
    const result = classifyDescricao('Problema genérico qualquer, sem palavras-chave.')
    expect(result.confianca).toBeLessThan(CONFIDENCE_THRESHOLD)
  })

  it('é determinístico — mesma entrada sempre produz a mesma saída', () => {
    const a = classifyDescricao('Vazamento na tubulação hidráulica.')
    const b = classifyDescricao('Vazamento na tubulação hidráulica.')
    expect(a).toEqual(b)
  })
})
