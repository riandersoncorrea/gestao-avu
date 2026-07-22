import { describe, expect, it } from 'vitest'
import { describeAuditChanges } from './describeAuditChanges'

describe('describeAuditChanges', () => {
  it('retorna rótulo genérico quando não há metadata.changes', () => {
    expect(describeAuditChanges(null)).toEqual({ label: 'Dados atualizados', comment: null })
    expect(describeAuditChanges({})).toEqual({ label: 'Dados atualizados', comment: null })
  })

  it('descreve uma única mudança de campo conhecido', () => {
    const result = describeAuditChanges({
      changes: { descricao: { from: 'Cerca danificada', to: 'Cerca danificada — trecho norte' } },
    })
    expect(result.label).toBe('Descrição alterado(a)')
    expect(result.comment).toBe('Descrição: Cerca danificada → Cerca danificada — trecho norte')
  })

  it('descreve múltiplas mudanças, uma por linha', () => {
    const result = describeAuditChanges({
      changes: {
        prioridade: { from: 'MEDIA', to: 'ALTA' },
        nota_sap: { from: null, to: '1000123' },
      },
    })
    expect(result.label).toBe('2 campos alterados')
    expect(result.comment).toBe('Prioridade: MEDIA → ALTA\nNota SAP: — → 1000123')
  })

  it('usa o nome bruto do campo quando não está no dicionário de rótulos', () => {
    const result = describeAuditChanges({ changes: { campo_desconhecido: { from: 'a', to: 'b' } } })
    expect(result.label).toBe('campo_desconhecido alterado(a)')
    expect(result.comment).toBe('campo_desconhecido: a → b')
  })

  it('formata valores nulos/vazios como travessão', () => {
    const result = describeAuditChanges({ changes: { local: { from: null, to: '' } } })
    expect(result.comment).toBe('Local: — → —')
  })
})
