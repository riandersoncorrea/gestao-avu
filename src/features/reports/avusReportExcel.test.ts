import { describe, expect, it } from 'vitest'
import { buildAvusReportWorkbook } from './avusReportExcel'
import type { Avu } from '@/features/avus/types'

function makeAvu(overrides: Partial<Avu> = {}): Avu {
  return {
    id: 'avu-1',
    numeroAvu: 'AVU-2026-0001',
    dataCriacao: '2026-03-01',
    gerenciaResponsavel: 'Manutenção',
    dataLimite: '2026-03-15',
    emitente: null,
    projeto: 'Projeto Teste',
    local: 'Oficina',
    latitude: null,
    longitude: null,
    descricao: 'Cerca danificada no trecho norte',
    categoria: 'Cercas',
    subcategoria: null,
    nivelConfiancaIa: null,
    status: 'EM_EXECUCAO',
    prioridade: 'ALTA',
    responsavel: { id: 'p1', fullName: 'Fulano de Tal' },
    empresaExecutante: 'Empresa X',
    fiscal: { id: 'p2', fullName: 'Fiscal da Silva' },
    notaSap: '1000123',
    ordemManutencao: 'OM-000456',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    statusSince: null,
    ...overrides,
  }
}

describe('buildAvusReportWorkbook', () => {
  it('cria uma aba "AVUs" com cabeçalho na ordem certa', () => {
    const workbook = buildAvusReportWorkbook([makeAvu()])
    const sheet = workbook.getWorksheet('AVUs')!
    const header = sheet.getRow(1).values as unknown[]
    expect(header.slice(1, 4)).toEqual(['Número AVU', 'Status', 'Prioridade'])
  })

  it('uma linha por AVU, com status/responsável/fiscal resolvidos', () => {
    const workbook = buildAvusReportWorkbook([makeAvu(), makeAvu({ id: 'avu-2', numeroAvu: 'AVU-2026-0002', responsavel: null })])
    const sheet = workbook.getWorksheet('AVUs')!
    expect(sheet.rowCount).toBe(3) // cabeçalho + 2 AVUs

    const row2 = sheet.getRow(2).values as unknown[]
    expect(row2[1]).toBe('AVU-2026-0001')
    expect(row2[2]).toBe('Em execução')
    expect(row2[9]).toBe('Fulano de Tal')

    const row3 = sheet.getRow(3).values as unknown[]
    expect(row3[9]).toBe('') // responsavel null -> string vazia
  })

  it('congela a primeira linha e ativa autofiltro', () => {
    const workbook = buildAvusReportWorkbook([makeAvu()])
    const sheet = workbook.getWorksheet('AVUs')!
    expect(sheet.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sheet.autoFilter).toBeDefined()
  })

  it('formata datas como células de data reais', () => {
    const workbook = buildAvusReportWorkbook([makeAvu()])
    const sheet = workbook.getWorksheet('AVUs')!
    const dataCriacaoCell = sheet.getRow(2).getCell(11)
    expect(dataCriacaoCell.value).toBeInstanceOf(Date)
    expect(dataCriacaoCell.numFmt).toBe('dd/mm/yyyy')
  })

  it('serializa em buffer sem lançar, mesmo com lista vazia', async () => {
    const workbook = buildAvusReportWorkbook([])
    const buffer = await workbook.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
