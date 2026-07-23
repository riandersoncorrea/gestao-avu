import { describe, expect, it } from 'vitest'
import { classifyDescricao } from './classify'

const CONFIDENCE_THRESHOLD = 80

describe('classifyDescricao (HeuristicAIProvider)', () => {
  it('classifica um caso claro de manutenção (cercas)', () => {
    const result = classifyDescricao('Cerca perimetral danificada, arame rompido em vários pontos.')
    expect(result.categoria).toBe('MANUTENÇÃO')
    expect(result.subcategoria).toBe('Cercas')
  })

  it('classifica um caso claro de iluminação (poste)', () => {
    const result = classifyDescricao('Poste apagado, luminária queimada, rua escura à noite.')
    expect(result.categoria).toBe('ILUMINAÇÃO')
  })

  it('classifica um caso claro de áreas verdes (roço) — descrição real de uma AVU usada para validar este pipeline', () => {
    // Texto estruturalmente idêntico ao de uma AVU real (nomes/local
    // genéricos) — "Vegetação alta" + recomendação de "roço" é o caso real
    // que motivou a correção deste módulo (ver docs/testing.md).
    const result = classifyDescricao(
      'Local: Cerca perimetral Molhe Norte. Vulnerabilidade: Vegetação alta. Recomendação de Segurança: Que seja realizado o roço no local.',
    )
    expect(result.categoria).toBe('ÁREAS VERDES')
  })

  it('classifica poda distinta de árvores em geral', () => {
    const result = classifyDescricao('Poda necessária no galho pendente sobre a via.')
    expect(result.categoria).toBe('ÁREAS VERDES')
    expect(result.subcategoria).toBe('Poda')
  })

  it('cai em OUTROS quando nenhuma palavra-chave bate', () => {
    const result = classifyDescricao('Situação incomum sem relação clara com nenhuma categoria conhecida.')
    expect(result.categoria).toBe('OUTROS')
    expect(result.subcategoria).toBe('Outros')
  })

  it('nunca ultrapassa o teto de confiança do classificador heurístico (é honestamente limitado)', () => {
    const result = classifyDescricao(
      'Cerca muro portão concertina alambrado arame farpado manutenção reparo estrutura',
    )
    expect(result.confianca).toBeLessThan(CONFIDENCE_THRESHOLD)
  })

  it('confiança abaixo do limiar de 80% deve exigir REVISAO_NECESSARIA (regra de negócio validada aqui)', () => {
    const result = classifyDescricao('Problema genérico qualquer, sem palavras-chave.')
    expect(result.confianca).toBeLessThan(CONFIDENCE_THRESHOLD)
  })

  it('é determinístico — mesma entrada sempre produz a mesma saída', () => {
    const a = classifyDescricao('Cerca perimetral danificada.')
    const b = classifyDescricao('Cerca perimetral danificada.')
    expect(a).toEqual(b)
  })
})
