import { describe, expect, it } from 'vitest'
import { parseAndValidateSapRows } from './shared'

const HEADER = ['Nota', 'OM', 'Status', 'Centro', 'Data Planejada', 'Data Execução', 'Prioridade', 'Descrição']

describe('parseAndValidateSapRows', () => {
  it('parseia um arquivo válido sem nenhum aviso', () => {
    const outcome = parseAndValidateSapRows([
      HEADER,
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '15/03/2026', '', 'Alta', 'AVU2026004155 - Recuperação de Cerca'],
    ])

    expect(outcome.hasBlockingErrors).toBe(false)
    expect(outcome.issues).toHaveLength(0)
    expect(outcome.rows).toEqual([
      {
        nota: '1000001',
        om: 'OM-0001',
        statusSap: 'Aberta',
        centro: 'CT01',
        dataPlanejada: '2026-03-15',
        dataExecucao: null,
        prioridadeSap: 'Alta',
        descricao: 'AVU2026004155 - Recuperação de Cerca',
      },
    ])
  })

  it('bloqueia quando falta uma coluna obrigatória (Descrição)', () => {
    const outcome = parseAndValidateSapRows([
      ['Nota', 'OM', 'Status', 'Centro', 'Data Planejada', 'Data Execução', 'Prioridade'],
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '15/03/2026', '', 'Alta'],
    ])

    expect(outcome.hasBlockingErrors).toBe(true)
    expect(outcome.rows).toHaveLength(0)
    expect(outcome.issues[0].level).toBe('error')
    expect(outcome.issues[0].message).toContain('Descrição')
  })

  it('bloqueia quando faltam as duas colunas obrigatórias e lista as duas', () => {
    const outcome = parseAndValidateSapRows([
      ['OM', 'Status', 'Centro'],
      ['OM-0001', 'Aberta', 'CT01'],
    ])

    expect(outcome.hasBlockingErrors).toBe(true)
    expect(outcome.issues[0].message).toContain('Nota')
    expect(outcome.issues[0].message).toContain('Descrição')
  })

  it('identifica coluna desconhecida sem bloquear o import', () => {
    const outcome = parseAndValidateSapRows([
      [...HEADER, 'Coluna Estranha'],
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '15/03/2026', '', 'Alta', 'AVU2026004155 - Recuperação de Cerca', 'valor qualquer'],
    ])

    expect(outcome.hasBlockingErrors).toBe(false)
    expect(outcome.rows).toHaveLength(1)
    const warning = outcome.issues.find((issue) => issue.message.includes('Coluna Estranha'))
    expect(warning?.level).toBe('warning')
  })

  it('avisa sobre linha sem Nota/Descrição sem bloquear as demais', () => {
    const outcome = parseAndValidateSapRows([
      HEADER,
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '15/03/2026', '', 'Alta', 'AVU2026004155 - Recuperação de Cerca'],
      ['', 'OM-0002', 'Aberta', 'CT02', '', '', 'Baixa', ''],
    ])

    expect(outcome.hasBlockingErrors).toBe(false)
    expect(outcome.rows).toHaveLength(2)
    const warning = outcome.issues.find((issue) => issue.message.includes('sem Nota e/ou Descrição'))
    expect(warning).toBeDefined()
    expect(warning?.message).toContain('linha(s) 3')
  })

  it('avisa sobre data em formato não reconhecido, mas mantém a linha', () => {
    const outcome = parseAndValidateSapRows([
      HEADER,
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '2026/03/15', '', 'Alta', 'AVU2026004155 - Recuperação de Cerca'],
    ])

    expect(outcome.hasBlockingErrors).toBe(false)
    expect(outcome.rows[0].dataPlanejada).toBeNull()
    const warning = outcome.issues.find((issue) => issue.message.includes('formato não reconhecido'))
    expect(warning?.level).toBe('warning')
  })

  it('aceita variações conhecidas de cabeçalho (ex.: "Ordem de Manutenção")', () => {
    const outcome = parseAndValidateSapRows([
      ['Nota', 'Ordem de Manutenção', 'Status', 'Centro', 'Data Planejada', 'Data de Execucao', 'Prioridade', 'Descricao'],
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '15/03/2026', '20/03/2026', 'Alta', 'AVU2026004155 - Recuperação de Cerca'],
    ])

    expect(outcome.hasBlockingErrors).toBe(false)
    expect(outcome.issues).toHaveLength(0)
    expect(outcome.rows[0].om).toBe('OM-0001')
    expect(outcome.rows[0].dataExecucao).toBe('2026-03-20')
  })

  it('trata arquivo vazio como erro bloqueante', () => {
    const outcome = parseAndValidateSapRows([])
    expect(outcome.hasBlockingErrors).toBe(true)
    expect(outcome.issues[0].message).toContain('vazio')
  })

  it('ignora linhas completamente em branco sem gerar aviso de campo obrigatório', () => {
    const outcome = parseAndValidateSapRows([
      HEADER,
      ['1000001', 'OM-0001', 'Aberta', 'CT01', '15/03/2026', '', 'Alta', 'AVU2026004155 - Recuperação de Cerca'],
      ['', '', '', '', '', '', '', ''],
    ])

    expect(outcome.rows).toHaveLength(1)
    expect(outcome.issues).toHaveLength(0)
  })
})
