import type { SapParsedRow } from '../types'

/** Remove acentos, baixa-caixa e apara espaços — pra comparar cabeçalhos de forma tolerante. */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Cada campo aceita algumas variações comuns de cabeçalho (com/sem acento, abreviações). */
const HEADER_ALIASES: Record<keyof Omit<SapParsedRow, 'avuNumeroExtraido'>, string[]> = {
  nota: ['nota'],
  om: ['om', 'ordem de manutencao', 'ordem'],
  statusSap: ['status'],
  centro: ['centro'],
  dataPlanejada: ['data planejada'],
  dataExecucao: ['data execucao', 'data de execucao'],
  prioridadeSap: ['prioridade'],
  descricao: ['descricao'],
}

function buildHeaderIndex(headers: string[]): Partial<Record<keyof Omit<SapParsedRow, 'avuNumeroExtraido'>, number>> {
  const normalized = headers.map(normalizeHeader)
  const index: Partial<Record<keyof Omit<SapParsedRow, 'avuNumeroExtraido'>, number>> = {}

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof Omit<SapParsedRow, 'avuNumeroExtraido'>, string[]][]) {
    const position = normalized.findIndex((h) => aliases.includes(h))
    if (position !== -1) index[field] = position
  }

  return index
}

/** Converte "DD/MM/YYYY" (ou já ISO "YYYY-MM-DD") para ISO. Formato não reconhecido vira null. */
function toIsoDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const brMatch = /^(\d{2})[/\-.](\d{2})[/\-.](\d{4})$/.exec(trimmed)
  if (brMatch) {
    const [, day, month, year] = brMatch
    return `${year}-${month}-${day}`
  }

  return null
}

function cellToText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

/**
 * Recebe as linhas já em formato de matriz (cabeçalho na primeira linha) —
 * usado tanto pelo parser de CSV (papaparse) quanto de XLSX (exceljs), que
 * convergem pra essa mesma forma antes de chamar esta função.
 */
export function rowsToSapParsedRows(rows: unknown[][]): Omit<SapParsedRow, 'avuNumeroExtraido'>[] {
  if (rows.length === 0) return []

  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map((cell) => String(cell ?? ''))
  const index = buildHeaderIndex(headers)

  function get(row: unknown[], field: keyof Omit<SapParsedRow, 'avuNumeroExtraido'>): string | null {
    const position = index[field]
    if (position === undefined) return null
    return cellToText(row[position])
  }

  return dataRows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))
    .map((row) => ({
      nota: get(row, 'nota'),
      om: get(row, 'om'),
      statusSap: get(row, 'statusSap'),
      centro: get(row, 'centro'),
      dataPlanejada: toIsoDate(get(row, 'dataPlanejada')),
      dataExecucao: toIsoDate(get(row, 'dataExecucao')),
      prioridadeSap: get(row, 'prioridadeSap'),
      descricao: get(row, 'descricao'),
    }))
}
