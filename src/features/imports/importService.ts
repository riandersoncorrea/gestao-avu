import { supabase } from '@/lib/supabase'
import type { AvuImport, AvuImportLog, AvuImportStatus, ExtractedFields } from './types'

const STAGING_BUCKET = 'avu-import-staging'
const FUNCTION_NAME = 'process-avu-import'

interface RawAvuImportRow {
  id: string
  avu_id: string | null
  status: AvuImportStatus
  original_file_name: string
  staging_path: string
  staging_image_paths: string[] | null
  image_count: number | null
  extracted_fields: ExtractedFields | null
  categoria_sugerida: string | null
  subcategoria_sugerida: string | null
  confianca: number | null
  error_message: string | null
  created_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

function fromRow(row: RawAvuImportRow): AvuImport {
  return {
    id: row.id,
    avuId: row.avu_id,
    status: row.status,
    originalFileName: row.original_file_name,
    stagingPath: row.staging_path,
    stagingImagePaths: row.staging_image_paths ?? [],
    imageCount: row.image_count ?? 0,
    extractedFields: row.extracted_fields,
    categoriaSugerida: row.categoria_sugerida,
    subcategoriaSugerida: row.subcategoria_sugerida,
    confianca: row.confianca,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLUMNS =
  'id, avu_id, status, original_file_name, staging_path, staging_image_paths, image_count, extracted_fields, categoria_sugerida, subcategoria_sugerida, confianca, error_message, created_by, reviewed_by, reviewed_at, created_at, updated_at'

export async function listImports(): Promise<AvuImport[]> {
  const { data, error } = await supabase
    .from('avu_imports')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as RawAvuImportRow[]).map(fromRow)
}

export async function getImport(id: string): Promise<AvuImport | null> {
  const { data, error } = await supabase.from('avu_imports').select(SELECT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return fromRow(data as unknown as RawAvuImportRow)
}

export async function listImportLogs(importId: string): Promise<AvuImportLog[]> {
  const { data, error } = await supabase
    .from('avu_import_logs')
    .select('id, import_id, step, status, message, metadata, created_at')
    .eq('import_id', importId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    importId: row.import_id,
    step: row.step,
    status: row.status,
    message: row.message,
    metadata: row.metadata,
    createdAt: row.created_at,
  }))
}

/**
 * Faz upload de um PDF pro bucket de staging e registra a linha na fila
 * (RPC `avu_import_start`, status AGUARDANDO). Não dispara o processamento —
 * isso é feito por `processImport`, chamado sequencialmente pela página
 * depois que todos os uploads do lote já terminaram (ver ImportsPage.tsx),
 * pra fila mostrar de verdade AGUARDANDO acumulando enquanto só um item
 * processa por vez.
 */
export async function stageImport(file: File): Promise<string> {
  const importId = crypto.randomUUID()
  const stagingPath = `${importId}/original.pdf`

  const { error: uploadError } = await supabase.storage.from(STAGING_BUCKET).upload(stagingPath, file, {
    contentType: 'application/pdf',
  })
  if (uploadError) throw uploadError

  const { error: rpcError } = await supabase.rpc('avu_import_start', {
    p_import_id: importId,
    p_original_file_name: file.name,
    p_staging_path: stagingPath,
  })
  if (rpcError) {
    await supabase.storage.from(STAGING_BUCKET).remove([stagingPath])
    throw rpcError
  }

  return importId
}

/**
 * Invoca a Edge Function pra rodar o pipeline sobre uma importação já em
 * AGUARDANDO. Falhas aqui (ex.: function ainda não publicada) deixam a
 * importação em ERRO, visível na fila, em vez de propagar a exceção — o
 * chamador (loop sequencial da página) não deve parar no meio do lote.
 */
export async function processImport(importId: string): Promise<void> {
  try {
    const { error: invokeError } = await supabase.functions.invoke(FUNCTION_NAME, { body: { importId } })
    if (invokeError) throw invokeError
  } catch (error) {
    await supabase
      .from('avu_imports')
      .update({ status: 'ERRO', error_message: `Falha ao processar: ${String(error)}` })
      .eq('id', importId)
  }
}

export async function retryImport(importId: string): Promise<void> {
  const { error: rpcError } = await supabase.rpc('avu_import_retry', { p_import_id: importId })
  if (rpcError) throw rpcError
  await processImport(importId)
}

export async function confirmImport(
  importId: string,
  fields: ExtractedFields,
  categoria: string,
  subcategoria: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ avuId: string }>(FUNCTION_NAME, {
    body: { importId, action: 'confirm', fields, categoria, subcategoria },
  })
  if (error) throw error
  if (!data?.avuId) throw new Error('A confirmação não retornou o id da AVU criada')
  return data.avuId
}

/** Preview do PDF original enquanto ele ainda está no staging (antes da AVU existir). */
export async function getStagingPdfUrl(stagingPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(STAGING_BUCKET).createSignedUrl(stagingPath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

/** Miniaturas das imagens extraídas do PDF, enquanto ainda estão no staging (antes da confirmação). */
export async function getStagingImageUrls(stagingImagePaths: string[]): Promise<string[]> {
  if (stagingImagePaths.length === 0) return []
  const { data, error } = await supabase.storage.from(STAGING_BUCKET).createSignedUrls(stagingImagePaths, 60 * 10)
  if (error) throw error
  return data.map((entry) => entry.signedUrl).filter((url): url is string => Boolean(url))
}
