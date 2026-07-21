export const AVU_STATUSES = [
  'NOVO',
  'TRIAGEM',
  'PLANEJAMENTO',
  'PROGRAMADO',
  'EM_EXECUCAO',
  'AGUARDANDO_EVIDENCIAS',
  'AGUARDANDO_APROVACAO',
  'CONCLUIDO',
  'REPROVADO',
  'CANCELADO',
] as const

export type AvuStatus = (typeof AVU_STATUSES)[number]

export interface AvuProfileRef {
  id: string
  fullName: string
}

export interface Avu {
  id: string
  numeroAvu: string
  dataCriacao: string
  gerenciaResponsavel: string | null
  dataLimite: string | null
  emitente: AvuProfileRef | null
  projeto: string | null
  local: string | null
  latitude: number | null
  longitude: number | null
  descricao: string
  categoria: string | null
  subcategoria: string | null
  nivelConfiancaIa: number | null
  status: AvuStatus
  responsavel: AvuProfileRef | null
  empresaExecutante: string | null
  fiscal: AvuProfileRef | null
  notaSap: string | null
  ordemManutencao: string | null
  createdAt: string
  updatedAt: string
}

export interface AvuFormValues {
  gerenciaResponsavel: string
  dataLimite: string
  emitenteId: string
  projeto: string
  local: string
  latitude: string
  longitude: string
  descricao: string
  categoria: string
  subcategoria: string
  nivelConfiancaIa: string
  responsavelId: string
  empresaExecutante: string
  fiscalId: string
  notaSap: string
  ordemManutencao: string
}

export interface AvuFilters {
  search: string
  status: AvuStatus | ''
  categoria: string
  gerenciaResponsavel: string
  projeto: string
  local: string
  empresaExecutante: string
  responsavelId: string
  periodoInicio: string
  periodoFim: string
}

export const EMPTY_AVU_FILTERS: AvuFilters = {
  search: '',
  status: '',
  categoria: '',
  gerenciaResponsavel: '',
  projeto: '',
  local: '',
  empresaExecutante: '',
  responsavelId: '',
  periodoInicio: '',
  periodoFim: '',
}

export interface AvuComment {
  id: string
  avuId: string
  authorId: string | null
  authorName: string
  body: string
  createdAt: string
}

export type AvuAttachmentKind = 'document' | 'photo'

export interface AvuAttachment {
  id: string
  avuId: string
  kind: AvuAttachmentKind
  filePath: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedBy: string | null
  createdAt: string
}
