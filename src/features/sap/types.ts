export const SAP_IMPORT_STATUSES = ['PROCESSANDO', 'PROCESSADO', 'ERRO'] as const
export type SapImportStatus = (typeof SAP_IMPORT_STATUSES)[number]

export const SAP_RECORD_MATCH_STATUSES = ['RELACIONADO', 'AVU_NAO_ENCONTRADO', 'DUPLICADO', 'ERRO'] as const
export type SapRecordMatchStatus = (typeof SAP_RECORD_MATCH_STATUSES)[number]

export interface SapImport {
  id: string
  fileName: string
  fileType: 'csv' | 'xlsx'
  regexPattern: string
  status: SapImportStatus
  totalRecords: number
  matchedCount: number
  unmatchedCount: number
  duplicateCount: number
  errorCount: number
  errorMessage: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Linha bruta extraída do CSV/XLSX, antes de virar `sap_records` no banco. */
export interface SapParsedRow {
  nota: string | null
  om: string | null
  statusSap: string | null
  centro: string | null
  dataPlanejada: string | null // ISO 'YYYY-MM-DD'
  dataExecucao: string | null
  prioridadeSap: string | null
  descricao: string | null
  avuNumeroExtraido: string | null
}

export interface SapRecord {
  id: string
  sapImportId: string
  nota: string | null
  om: string | null
  statusSap: string | null
  centro: string | null
  dataPlanejada: string | null
  dataExecucao: string | null
  prioridadeSap: string | null
  descricao: string | null
  avuNumeroExtraido: string | null
  avuId: string | null
  avuNumeroAvu: string | null
  matchStatus: SapRecordMatchStatus
  errorMessage: string | null
  createdAt: string
}

export interface SapBatchSummary {
  total: number
  matched: number
  unmatched: number
  duplicate: number
  error: number
}
