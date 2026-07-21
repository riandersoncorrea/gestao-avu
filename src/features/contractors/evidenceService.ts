import { supabase } from '@/lib/supabase'
import { detectEvidenceTipo } from './evidenceTipo'
import type { AvuEvidence, EvidenceSubmissionContext, EvidenceTipo } from './types'

const EVIDENCES_BUCKET = 'avu-evidences'

interface RawEvidenceRow {
  id: string
  avu_id: string
  tipo: EvidenceTipo
  arquivo: string
  nome_arquivo: string
  mime_type: string | null
  tamanho_bytes: number | null
  descricao: string | null
  data_upload: string
  usuario: string | null
  latitude: number | null
  longitude: number | null
  data_execucao: string | null
  equipe: string | null
  equipamentos: string | null
  usuario_profile: { full_name: string } | null
}

function fromRow(row: RawEvidenceRow): AvuEvidence {
  return {
    id: row.id,
    avuId: row.avu_id,
    tipo: row.tipo,
    arquivo: row.arquivo,
    nomeArquivo: row.nome_arquivo,
    mimeType: row.mime_type,
    tamanhoBytes: row.tamanho_bytes,
    descricao: row.descricao,
    dataUpload: row.data_upload,
    usuario: row.usuario,
    usuarioNome: row.usuario_profile?.full_name ?? 'Usuário removido',
    latitude: row.latitude,
    longitude: row.longitude,
    dataExecucao: row.data_execucao,
    equipe: row.equipe,
    equipamentos: row.equipamentos,
  }
}

export async function listEvidences(avuId: string, tipo?: EvidenceTipo): Promise<AvuEvidence[]> {
  let query = supabase
    .from('avu_evidences')
    .select(
      'id, avu_id, tipo, arquivo, nome_arquivo, mime_type, tamanho_bytes, descricao, data_upload, usuario, latitude, longitude, data_execucao, equipe, equipamentos, usuario_profile:profiles(full_name)',
    )
    .eq('avu_id', avuId)
    .order('data_upload', { ascending: false })

  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query

  if (error) throw error
  return (data as unknown as RawEvidenceRow[]).map(fromRow)
}

/** Envia um lote de arquivos como evidência, aplicando o mesmo contexto (observação/data de
 * execução/equipe/equipamentos/GPS) a cada arquivo. Não dispara a transição de status —
 * isso é feito separadamente por `submitEvidence` (features/avus/avuService.ts). */
export async function uploadEvidences(
  avuId: string,
  usuarioId: string,
  files: File[],
  context: EvidenceSubmissionContext,
): Promise<void> {
  const uploadedPaths: string[] = []

  try {
    for (const file of files) {
      const path = `avus/${avuId}/evidences/${crypto.randomUUID()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from(EVIDENCES_BUCKET).upload(path, file)
      if (uploadError) throw uploadError
      uploadedPaths.push(path)

      const { error: insertError } = await supabase.from('avu_evidences').insert({
        avu_id: avuId,
        tipo: detectEvidenceTipo(file.type),
        arquivo: path,
        nome_arquivo: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
        descricao: context.descricao.trim() || null,
        usuario: usuarioId,
        latitude: context.latitude,
        longitude: context.longitude,
        data_execucao: context.dataExecucao || null,
        equipe: context.equipe.trim() || null,
        equipamentos: context.equipamentos.trim() || null,
      })

      if (insertError) throw insertError
    }
  } catch (error) {
    await supabase.storage.from(EVIDENCES_BUCKET).remove(uploadedPaths)
    throw error
  }
}

export async function getEvidenceUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(EVIDENCES_BUCKET).createSignedUrl(filePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

export async function deleteEvidence(id: string, filePath: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from(EVIDENCES_BUCKET).remove([filePath])
  if (storageError) throw storageError

  const { error } = await supabase.from('avu_evidences').delete().eq('id', id)
  if (error) throw error
}
