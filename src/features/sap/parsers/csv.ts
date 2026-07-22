import Papa from 'papaparse'
import { parseAndValidateSapRows, type SapParseOutcome } from './shared'

export async function parseSapCsv(file: File): Promise<SapParseOutcome> {
  const text = await file.text()

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    // Detecta ";" (comum em exportações do SAP em pt-BR) ou "," automaticamente.
    delimitersToGuess: [',', ';', '\t'],
  })

  if (result.errors.length > 0) {
    throw new Error(`Falha ao ler CSV: ${result.errors[0].message}`)
  }

  return parseAndValidateSapRows(result.data)
}
