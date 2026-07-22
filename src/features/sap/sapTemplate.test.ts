import { describe, expect, it } from 'vitest'
import { buildSapTemplateWorkbook, SAP_TEMPLATE_FILE_NAME } from './sapTemplate'
import { CANONICAL_HEADERS, SAP_COLUMN_ORDER } from './parsers/shared'

describe('buildSapTemplateWorkbook', () => {
  it('cria as 3 abas na ordem certa, com DADOS_SAP primeiro', () => {
    const workbook = buildSapTemplateWorkbook()
    const names = workbook.worksheets.map((sheet) => sheet.name)
    expect(names).toEqual(['DADOS_SAP', 'INSTRUÇÕES', 'EXEMPLO'])
  })

  it('cabeçalho de DADOS_SAP bate exatamente com as colunas esperadas pelo parser, na ordem certa', () => {
    const workbook = buildSapTemplateWorkbook()
    const sheet = workbook.getWorksheet('DADOS_SAP')!
    const headerRow = sheet.getRow(1)
    const headers = SAP_COLUMN_ORDER.map((_, i) => String(headerRow.getCell(i + 1).value))
    expect(headers).toEqual(SAP_COLUMN_ORDER.map((field) => CANONICAL_HEADERS[field]))
  })

  it('cabeçalho de EXEMPLO usa a mesma estrutura de DADOS_SAP', () => {
    const workbook = buildSapTemplateWorkbook()
    const sheet = workbook.getWorksheet('EXEMPLO')!
    const headerRow = sheet.getRow(1)
    const headers = SAP_COLUMN_ORDER.map((_, i) => String(headerRow.getCell(i + 1).value))
    expect(headers).toEqual(SAP_COLUMN_ORDER.map((field) => CANONICAL_HEADERS[field]))
  })

  it('congela a primeira linha e ativa autofiltro em DADOS_SAP e EXEMPLO', () => {
    const workbook = buildSapTemplateWorkbook()
    for (const name of ['DADOS_SAP', 'EXEMPLO']) {
      const sheet = workbook.getWorksheet(name)!
      expect(sheet.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
      expect(sheet.autoFilter).toBeDefined()
    }
  })

  it('DADOS_SAP tem pelo menos uma linha de exemplo com o padrão "AVU<numero> - <descrição>"', () => {
    const workbook = buildSapTemplateWorkbook()
    const sheet = workbook.getWorksheet('DADOS_SAP')!
    const descricaoColumn = SAP_COLUMN_ORDER.indexOf('descricao') + 1
    const values: string[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      values.push(String(row.getCell(descricaoColumn).value ?? ''))
    })
    expect(values.length).toBeGreaterThan(0)
    expect(values.some((v) => /^AVU\d+ - /.test(v))).toBe(true)
  })

  it('INSTRUÇÕES documenta todas as 8 colunas', () => {
    const workbook = buildSapTemplateWorkbook()
    const sheet = workbook.getWorksheet('INSTRUÇÕES')!
    const documentedColumns: string[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const value = row.getCell(1).value
      if (value) documentedColumns.push(String(value))
    })
    for (const header of Object.values(CANONICAL_HEADERS)) {
      expect(documentedColumns).toContain(header)
    }
  })

  it('exporta o nome de arquivo oficial', () => {
    expect(SAP_TEMPLATE_FILE_NAME).toBe('template_importacao_sap.xlsx')
  })

  it('o workbook gerado consegue ser serializado em buffer (writeBuffer não lança)', async () => {
    const workbook = buildSapTemplateWorkbook()
    const buffer = await workbook.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
