export const AVU_IMPORT_STATUSES = ['AGUARDANDO', 'PROCESSANDO', 'PROCESSADO', 'ERRO', 'REVISAO_NECESSARIA'] as const
export type AvuImportStatus = (typeof AVU_IMPORT_STATUSES)[number]

/** Espelha `ExtractedFields` de `supabase/functions/process-avu-import/lib/extractFields.ts`. */
export interface ExtractedFields {
  numeroAvu: string | null
  dataCriacao: string | null
  gerenciaResponsavel: string | null
  dataLimite: string | null
  emitenteNome: string | null
  emitenteId: string | null
  projeto: string | null
  local: string | null
  latitude: number | null
  longitude: number | null
  descricao: string | null
  missingFields: string[]
}

export interface AvuImport {
  id: string
  avuId: string | null
  status: AvuImportStatus
  originalFileName: string
  stagingPath: string
  stagingImagePaths: string[]
  imageCount: number
  extractedFields: ExtractedFields | null
  categoriaSugerida: string | null
  subcategoriaSugerida: string | null
  confianca: number | null
  errorMessage: string | null
  createdBy: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AvuImportLogStatus = 'INICIADO' | 'SUCESSO' | 'ERRO'

export interface AvuImportLog {
  id: string
  importId: string
  step: string
  status: AvuImportLogStatus
  message: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
