import { supabase } from '@/lib/supabase'
import type { SapBatchSummary, SapImport, SapImportStatus, SapParsedRow, SapRecord, SapRecordMatchStatus } from './types'

interface RawSapImportRow {
  id: string
  file_name: string
  file_type: 'csv' | 'xlsx'
  regex_pattern: string
  status: SapImportStatus
  total_records: number
  matched_count: number
  unmatched_count: number
  duplicate_count: number
  error_count: number
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function fromImportRow(row: RawSapImportRow): SapImport {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    regexPattern: row.regex_pattern,
    status: row.status,
    totalRecords: row.total_records,
    matchedCount: row.matched_count,
    unmatchedCount: row.unmatched_count,
    duplicateCount: row.duplicate_count,
    errorCount: row.error_count,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const IMPORT_SELECT =
  'id, file_name, file_type, regex_pattern, status, total_records, matched_count, unmatched_count, duplicate_count, error_count, error_message, created_by, created_at, updated_at'

export async function listImports(): Promise<SapImport[]> {
  const { data, error } = await supabase.from('sap_imports').select(IMPORT_SELECT).order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as RawSapImportRow[]).map(fromImportRow)
}

export async function getImport(id: string): Promise<SapImport | null> {
  const { data, error } = await supabase.from('sap_imports').select(IMPORT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return fromImportRow(data as unknown as RawSapImportRow)
}

interface RawSapRecordRow {
  id: string
  sap_import_id: string
  nota: string | null
  om: string | null
  status_sap: string | null
  centro: string | null
  data_planejada: string | null
  data_execucao: string | null
  prioridade_sap: string | null
  descricao: string | null
  avu_numero_extraido: string | null
  avu_id: string | null
  match_status: SapRecordMatchStatus
  error_message: string | null
  created_at: string
  avu: { numero_avu: string } | null
}

function fromRecordRow(row: RawSapRecordRow): SapRecord {
  return {
    id: row.id,
    sapImportId: row.sap_import_id,
    nota: row.nota,
    om: row.om,
    statusSap: row.status_sap,
    centro: row.centro,
    dataPlanejada: row.data_planejada,
    dataExecucao: row.data_execucao,
    prioridadeSap: row.prioridade_sap,
    descricao: row.descricao,
    avuNumeroExtraido: row.avu_numero_extraido,
    avuId: row.avu_id,
    avuNumeroAvu: row.avu?.numero_avu ?? null,
    matchStatus: row.match_status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

const RECORD_SELECT =
  'id, sap_import_id, nota, om, status_sap, centro, data_planejada, data_execucao, prioridade_sap, descricao, avu_numero_extraido, avu_id, match_status, error_message, created_at, avu:avus(numero_avu)'

export async function listRecords(sapImportId: string, matchStatus?: SapRecordMatchStatus): Promise<SapRecord[]> {
  let query = supabase.from('sap_records').select(RECORD_SELECT).eq('sap_import_id', sapImportId).order('created_at', { ascending: true })
  if (matchStatus) query = query.eq('match_status', matchStatus)

  const { data, error } = await query
  if (error) throw error
  return (data as unknown as RawSapRecordRow[]).map(fromRecordRow)
}

/** Registros SAP vinculados a uma AVU específica — usado pela linha do tempo completa (`AvuTimeline`). */
export async function listRecordsForAvu(avuId: string): Promise<SapRecord[]> {
  const { data, error } = await supabase
    .from('sap_records')
    .select(RECORD_SELECT)
    .eq('avu_id', avuId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as RawSapRecordRow[]).map(fromRecordRow)
}

/** Registra o import (status PROCESSANDO) — chamado logo após o parsing do arquivo no navegador. */
export async function startImport(importId: string, fileName: string, fileType: 'csv' | 'xlsx', regexPattern: string): Promise<void> {
  const { error } = await supabase.rpc('sap_import_start', {
    p_import_id: importId,
    p_file_name: fileName,
    p_file_type: fileType,
    p_regex_pattern: regexPattern,
  })
  if (error) throw error
}

/** Processa o lote inteiro numa chamada só — os registros já vêm parseados e com o número extraído. */
export async function processImport(importId: string, records: SapParsedRow[]): Promise<SapBatchSummary> {
  const { data, error } = await supabase.rpc('sap_import_process_batch', {
    p_import_id: importId,
    p_records: records,
  })
  if (error) throw error
  return data as SapBatchSummary
}

export async function retryImport(importId: string, regexPattern?: string): Promise<SapBatchSummary> {
  const { data, error } = await supabase.rpc('sap_import_retry', {
    p_import_id: importId,
    p_regex_pattern: regexPattern ?? null,
  })
  if (error) throw error
  return data as SapBatchSummary
}
