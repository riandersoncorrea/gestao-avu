import { describe, expect, it } from 'vitest'
import { extractAvuFields } from './extractFields'

const SAMPLE_PDF_TEXT = `
Análise de Vulnerabilidade

Número AVU: AVU-2026-0041
Data de Criação: 15/03/2026
Gerência Responsável: Manutenção Norte
Data Limite: 30/04/2026
Emitente: Maria Silva
Projeto: Projeto Alfa
Local: Pátio A
Latitude: -2,5307
Longitude: -44,3697
Descrição: Vazamento de água na tubulação principal do pátio,
próximo ao poste de iluminação 12. Necessário reparo hidráulico
com urgência antes do período de chuvas.
`

describe('extractAvuFields', () => {
  it('extrai todos os campos de um PDF bem formado', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)

    expect(result.numeroAvu).toBe('AVU-2026-0041')
    expect(result.dataCriacao).toBe('2026-03-15')
    expect(result.gerenciaResponsavel).toBe('Manutenção Norte')
    expect(result.dataLimite).toBe('2026-04-30')
    expect(result.emitenteNome).toBe('Maria Silva')
    expect(result.projeto).toBe('Projeto Alfa')
    expect(result.local).toBe('Pátio A')
    expect(result.latitude).toBeCloseTo(-2.5307)
    expect(result.longitude).toBeCloseTo(-44.3697)
    expect(result.descricao).toContain('Vazamento de água')
    expect(result.descricao).toContain('período de chuvas')
    expect(result.missingFields).toEqual([])
  })

  it('reporta campos obrigatórios faltando (data de criação e descrição)', () => {
    const text = 'Número AVU: AVU-2026-0042\nLocal: Pátio B\n'
    const result = extractAvuFields(text)

    expect(result.missingFields).toContain('dataCriacao')
    expect(result.missingFields).toContain('descricao')
    expect(result.dataCriacao).toBeNull()
    expect(result.descricao).toBeNull()
  })

  it('não extrai campos opcionais ausentes, mas não falha', () => {
    const text = 'Data de Criação: 01/01/2026\nDescrição: Problema simples.\n'
    const result = extractAvuFields(text)

    expect(result.numeroAvu).toBeNull()
    expect(result.emitenteNome).toBeNull()
    expect(result.latitude).toBeNull()
    expect(result.longitude).toBeNull()
    expect(result.missingFields).toEqual([])
  })

  it('para a descrição no próximo rótulo conhecido, não engole o resto do documento', () => {
    const text = 'Data de Criação: 01/01/2026\nDescrição: Primeira linha da descrição.\nProjeto: Projeto Z\n'
    const result = extractAvuFields(text)

    expect(result.descricao).toBe('Primeira linha da descrição.')
    expect(result.projeto).toBe('Projeto Z')
  })

  it('aceita datas já em formato ISO', () => {
    const text = 'Data de Criação: 2026-01-01\nDescrição: Teste.\n'
    const result = extractAvuFields(text)
    expect(result.dataCriacao).toBe('2026-01-01')
  })

  it('retorna null para datas em formato não reconhecido', () => {
    const text = 'Data de Criação: 1 de janeiro de 2026\nDescrição: Teste.\n'
    const result = extractAvuFields(text)
    expect(result.dataCriacao).toBeNull()
    expect(result.missingFields).toContain('dataCriacao')
  })

  it('trata texto completamente vazio sem lançar exceção', () => {
    const result = extractAvuFields('')
    expect(result.missingFields).toEqual(['dataCriacao', 'descricao'])
  })
})
