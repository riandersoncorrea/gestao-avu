import Papa from 'papaparse'
import type { SapParsedRow } from '../types'
import { rowsToSapParsedRows } from './shared'

export async function parseSapCsv(file: File): Promise<Omit<SapParsedRow, 'avuNumeroExtraido'>[]> {
  const text = await file.text()

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    // Detecta ";" (comum em exportações do SAP em pt-BR) ou "," automaticamente.
    delimitersToGuess: [',', ';', '\t'],
  })

  if (result.errors.length > 0) {
    throw new Error(`Falha ao ler CSV: ${result.errors[0].message}`)
  }

  return rowsToSapParsedRows(result.data)
}
