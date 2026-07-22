import ExcelJS from 'exceljs'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import type { Avu } from '@/features/avus/types'

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6357' } }
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }

const COLUMNS: { header: string; width: number }[] = [
  { header: 'Número AVU', width: 16 },
  { header: 'Status', width: 20 },
  { header: 'Prioridade', width: 12 },
  { header: 'Categoria', width: 18 },
  { header: 'Local', width: 20 },
  { header: 'Projeto', width: 18 },
  { header: 'Gerência responsável', width: 20 },
  { header: 'Empresa executante', width: 20 },
  { header: 'Responsável', width: 22 },
  { header: 'Fiscal', width: 22 },
  { header: 'Data de criação', width: 16 },
  { header: 'Data limite', width: 16 },
  { header: 'Nota SAP', width: 14 },
  { header: 'OM', width: 14 },
  { header: 'Descrição', width: 50 },
]

function toExcelDate(value: string | null): Date | null {
  if (!value) return null
  // `value` já vem em ISO (YYYY-MM-DD ou timestamptz) — Date nativo entende os dois.
  return new Date(value)
}

/** Monta o workbook do relatório gerencial em lote (mesmas convenções visuais de `sapTemplate.ts`). */
export function buildAvusReportWorkbook(avus: Avu[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Gestão de AVU — Serviços Operacionais São Luís EFC'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('AVUs')

  const headerRow = sheet.getRow(1)
  COLUMNS.forEach((column, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = column.header
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    sheet.getColumn(i + 1).width = column.width
  })
  headerRow.commit()
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const avu of avus) {
    const row = sheet.addRow([
      avu.numeroAvu,
      avuStatusLabel(avu.status),
      avu.prioridade,
      avu.categoria ?? '',
      avu.local ?? '',
      avu.projeto ?? '',
      avu.gerenciaResponsavel ?? '',
      avu.empresaExecutante ?? '',
      avu.responsavel?.fullName ?? '',
      avu.fiscal?.fullName ?? '',
      toExcelDate(avu.dataCriacao),
      toExcelDate(avu.dataLimite),
      avu.notaSap ?? '',
      avu.ordemManutencao ?? '',
      avu.descricao,
    ])
    row.getCell(11).numFmt = 'dd/mm/yyyy'
    row.getCell(12).numFmt = 'dd/mm/yyyy'
  }

  const lastColumnLetter = sheet.getColumn(COLUMNS.length).letter
  sheet.autoFilter = { from: 'A1', to: `${lastColumnLetter}1` }

  return workbook
}

export async function downloadAvusReportExcel(avus: Avu[]): Promise<void> {
  const workbook = buildAvusReportWorkbook(avus)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `relatorio_avus_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
