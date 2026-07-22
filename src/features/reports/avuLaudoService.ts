import { getAttachmentUrl, getAvuById, listAttachments, listStatusHistory } from '@/features/avus/avuService'
import { getEvidenceUrl, listEvidences } from '@/features/contractors/evidenceService'
import { listApprovals } from '@/features/inspections/approvalService'
import { describeConclusao } from './describeConclusao'
import type { AvuLaudoData, LaudoFoto } from './types'

/** Reúne todos os dados (inclusive URLs assinadas de foto) para o laudo em PDF de uma AVU. */
export async function getAvuLaudoData(avuId: string): Promise<AvuLaudoData> {
  const avu = await getAvuById(avuId)
  if (!avu) throw new Error('AVU não encontrada')

  const [attachmentPhotos, evidencePhotos, statusHistory, approvals] = await Promise.all([
    listAttachments(avuId, 'photo'),
    listEvidences(avuId, 'foto'),
    listStatusHistory(avuId),
    listApprovals(avuId),
  ])

  const fotosAntes: LaudoFoto[] = await Promise.all(
    attachmentPhotos.map(async (attachment) => ({
      id: attachment.id,
      nomeArquivo: attachment.fileName,
      url: await getAttachmentUrl(attachment.filePath),
    })),
  )

  const fotosDepois: LaudoFoto[] = await Promise.all(
    evidencePhotos.map(async (evidence) => ({
      id: evidence.id,
      nomeArquivo: evidence.nomeArquivo,
      url: await getEvidenceUrl(evidence.arquivo),
    })),
  )

  const dataConclusao = statusHistory.filter((entry) => entry.newStatus === 'CONCLUIDO').at(-1)?.createdAt ?? null
  const latestApproval = approvals[0] ?? null

  return {
    numeroAvu: avu.numeroAvu,
    descricao: avu.descricao,
    dataCriacao: avu.dataCriacao,
    dataConclusao,
    responsavelNome: avu.responsavel?.fullName ?? 'Não atribuído',
    ordemManutencao: avu.ordemManutencao,
    notaSap: avu.notaSap,
    conclusao: describeConclusao(latestApproval, avu.status),
    fotosAntes,
    fotosDepois,
  }
}
