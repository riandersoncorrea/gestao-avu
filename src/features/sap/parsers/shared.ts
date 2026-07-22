import type { SapParsedRow } from '../types'

export type SapField = keyof Omit<SapParsedRow, 'avuNumeroExtraido'>

/** Ordem canônica das colunas — usada tanto pela validação quanto pelo gerador do template oficial. */
export const SAP_COLUMN_ORDER: SapField[] = [
  'nota',
  'om',
  'statusSap',
  'centro',
  'dataPlanejada',
  'dataExecucao',
  'prioridadeSap',
  'descricao',
]

/** Nome de cabeçalho exibido ao usuário (template, mensagens de validação) para cada campo. */
export const CANONICAL_HEADERS: Record<SapField, string> = {
  nota: 'Nota',
  om: 'OM',
  statusSap: 'Status',
  centro: 'Centro',
  dataPlanejada: 'Data Planejada',
  dataExecucao: 'Data Execução',
  prioridadeSap: 'Prioridade',
  descricao: 'Descrição',
}

/**
 * Nota e Descrição são as únicas colunas de fato obrigatórias: Nota identifica o registro
 * (usada na checagem de duplicata) e Descrição é de onde o número da AVU é extraído — sem
 * elas a linha não tem como ser relacionada a nada. As demais são só contexto do SAP.
 */
export const REQUIRED_FIELDS: SapField[] = ['nota', 'descricao']

const DATE_FIELDS: SapField[] = ['dataPlanejada', 'dataExecucao']

/** Remove acentos, baixa-caixa e apara espaços — pra comparar cabeçalhos de forma tolerante. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Cada campo aceita algumas variações comuns de cabeçalho (com/sem acento, abreviações). */
export const HEADER_ALIASES: Record<SapField, string[]> = {
  nota: ['nota'],
  om: ['om', 'ordem de manutencao', 'ordem'],
  statusSap: ['status'],
  centro: ['centro'],
  dataPlanejada: ['data planejada'],
  dataExecucao: ['data execucao', 'data de execucao'],
  prioridadeSap: ['prioridade'],
  descricao: ['descricao'],
}

function buildHeaderIndex(headers: string[]): Partial<Record<SapField, number>> {
  const normalized = headers.map(normalizeHeader)
  const index: Partial<Record<SapField, number>> = {}

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [SapField, string[]][]) {
    const position = normalized.findIndex((h) => aliases.includes(h))
    if (position !== -1) index[field] = position
  }

  return index
}

/** Converte "DD/MM/YYYY" (ou "DD-MM-YYYY"/"DD.MM.YYYY", ou já ISO "YYYY-MM-DD") para ISO. Formato não reconhecido vira null. */
export function toIsoDate(raw: string | undefined | null): string | null {
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

export interface SapFileValidationIssue {
  level: 'error' | 'warning'
  message: string
}

export interface SapParseOutcome {
  rows: Omit<SapParsedRow, 'avuNumeroExtraido'>[]
  issues: SapFileValidationIssue[]
  /** true quando falta coluna obrigatória (ou o arquivo está vazio) — nesse caso `rows` vem vazio e o import não deve prosseguir. */
  hasBlockingErrors: boolean
}

/**
 * Recebe as linhas já em formato de matriz (cabeçalho na primeira linha) — usado tanto pelo
 * parser de CSV (papaparse) quanto de XLSX (exceljs), que convergem pra essa mesma forma antes
 * de chamar esta função. Valida estrutura (colunas obrigatórias/desconhecidas) e dados por linha
 * (campos obrigatórios vazios, datas em formato não reconhecido) sem alterar em nada a lógica de
 * relacionamento SAP→AVU, que continua inteiramente do lado do banco (`sap_import_process_batch`).
 */
export function parseAndValidateSapRows(rows: unknown[][]): SapParseOutcome {
  if (rows.length === 0) {
    return { rows: [], issues: [{ level: 'error', message: 'O arquivo está vazio.' }], hasBlockingErrors: true }
  }

  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map((cell) => String(cell ?? '').trim()).filter((h) => h.length > 0)
  const normalizedHeaders = headers.map(normalizeHeader)
  const index = buildHeaderIndex(headers)

  const issues: SapFileValidationIssue[] = []

  const missingColumns = SAP_COLUMN_ORDER.filter((field) => REQUIRED_FIELDS.includes(field) && index[field] === undefined)
  if (missingColumns.length > 0) {
    issues.push({
      level: 'error',
      message: `Coluna(s) obrigatória(s) ausente(s): ${missingColumns.map((f) => CANONICAL_HEADERS[f]).join(', ')}.`,
    })
  }

  const knownAliases = new Set(Object.values(HEADER_ALIASES).flat())
  const unknownHeaders = headers.filter((_, i) => !knownAliases.has(normalizedHeaders[i]))
  if (unknownHeaders.length > 0) {
    issues.push({
      level: 'warning',
      message: `Coluna(s) não reconhecida(s) — serão ignoradas: ${unknownHeaders.join(', ')}.`,
    })
  }

  if (missingColumns.length > 0) {
    return { rows: [], issues, hasBlockingErrors: true }
  }

  function get(row: unknown[], field: SapField): string | null {
    const position = index[field]
    if (position === undefined) return null
    return cellToText(row[position])
  }

  const parsedRows: Omit<SapParsedRow, 'avuNumeroExtraido'>[] = []
  const missingRequiredRows: number[] = []
  const invalidDateCells: { row: number; column: string }[] = []
  let rowNumber = 1 // linha 1 é o cabeçalho — a primeira linha de dados é a 2

  for (const row of dataRows) {
    rowNumber++
    const isEmpty = row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')
    if (isEmpty) continue

    if (REQUIRED_FIELDS.some((field) => !get(row, field))) {
      missingRequiredRows.push(rowNumber)
    }

    for (const field of DATE_FIELDS) {
      const raw = get(row, field)
      if (raw && toIsoDate(raw) === null) {
        invalidDateCells.push({ row: rowNumber, column: CANONICAL_HEADERS[field] })
      }
    }

    parsedRows.push({
      nota: get(row, 'nota'),
      om: get(row, 'om'),
      statusSap: get(row, 'statusSap'),
      centro: get(row, 'centro'),
      dataPlanejada: toIsoDate(get(row, 'dataPlanejada')),
      dataExecucao: toIsoDate(get(row, 'dataExecucao')),
      prioridadeSap: get(row, 'prioridadeSap'),
      descricao: get(row, 'descricao'),
    })
  }

  if (missingRequiredRows.length > 0) {
    const preview = missingRequiredRows.slice(0, 10).join(', ')
    const suffix = missingRequiredRows.length > 10 ? '...' : ''
    issues.push({
      level: 'warning',
      message: `${missingRequiredRows.length} linha(s) sem Nota e/ou Descrição preenchida (linha(s) ${preview}${suffix}) — o relacionamento com a AVU não funcionará para essas linhas.`,
    })
  }

  if (invalidDateCells.length > 0) {
    const first = invalidDateCells[0]
    issues.push({
      level: 'warning',
      message: `${invalidDateCells.length} data(s) em formato não reconhecido (ex.: linha ${first.row}, coluna "${first.column}") — use DD/MM/AAAA. O valor será ignorado nessas células.`,
    })
  }

  return { rows: parsedRows, issues, hasBlockingErrors: false }
}
