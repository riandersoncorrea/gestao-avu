export const EVIDENCE_TIPOS = ['foto', 'video', 'documento'] as const
export type EvidenceTipo = (typeof EVIDENCE_TIPOS)[number]

export interface AvuEvidence {
  id: string
  avuId: string
  tipo: EvidenceTipo
  arquivo: string
  nomeArquivo: string
  mimeType: string | null
  tamanhoBytes: number | null
  descricao: string | null
  dataUpload: string
  usuario: string | null
  usuarioNome: string
  latitude: number | null
  longitude: number | null
  dataExecucao: string | null
  equipe: string | null
  equipamentos: string | null
}

/** Metadados de contexto compartilhados por todos os arquivos de um mesmo envio. */
export interface EvidenceSubmissionContext {
  descricao: string
  dataExecucao: string
  equipe: string
  equipamentos: string
  latitude: number | null
  longitude: number | null
}

export interface PortalDashboardStats {
  total: number
  pendentes: number
  emExecucao: number
  aguardandoEvidencias: number
  concluidos: number
  vencidos: number
}
