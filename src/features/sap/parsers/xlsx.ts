import ExcelJS from 'exceljs'
import type { SapParsedRow } from '../types'
import { rowsToSapParsedRows } from './shared'

export async function parseSapXlsx(file: File): Promise<Omit<SapParsedRow, 'avuNumeroExtraido'>[]> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('A planilha não tem nenhuma aba.')

  const rows: unknown[][] = []
  worksheet.eachRow((row) => {
    // `row.values` do exceljs é 1-indexado (values[0] é sempre undefined) — descarta esse índice 0.
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values.map((cell) => (cell && typeof cell === 'object' && 'text' in cell ? (cell as { text: string }).text : cell)))
  })

  return rowsToSapParsedRows(rows)
}
