import { useQuery } from '@tanstack/react-query'
import { Camera, CheckCircle2, Circle, FileEdit, FileText, FileUp, Link2, RefreshCcw, Send, ShieldAlert, Video, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { listAuditLogsForEntity } from '@/services/auditLogService'
import { listEvidences } from '@/features/contractors/evidenceService'
import { listRecordsForAvu } from '@/features/sap/sapImportService'
import { formatDateTime } from '@/utils/format'
import { describeAuditChanges } from '../describeAuditChanges'
import { listStatusHistory } from '../avuService'
import { avuStatusLabel } from './AvuStatusBadge'
import type { AvuStatus } from '../types'
import type { EvidenceTipo } from '@/features/contractors/types'

const ACTION_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  'avu.created': { label: 'AVU criada', icon: Circle },
  'avu_import.confirm': { label: 'AVU criada via importação de PDF', icon: FileUp },
}

const EVIDENCE_ICON: Record<EvidenceTipo, LucideIcon> = {
  foto: Camera,
  video: Video,
  documento: FileText,
}

const EVIDENCE_LABEL: Record<EvidenceTipo, string> = {
  foto: 'Evidência enviada (foto)',
  video: 'Evidência enviada (vídeo)',
  documento: 'Evidência enviada (documento)',
}

interface TimelineEntry {
  id: string
  createdAt: string
  actorName: string
  icon: LucideIcon
  label: string
  comment?: string | null
}

function describeStatusChange(previous: AvuStatus | null, next: AvuStatus): { label: string; icon: LucideIcon } {
  if (next === 'CANCELADO') return { label: 'AVU cancelada', icon: XCircle }
  if (next === 'AGUARDANDO_APROVACAO') return { label: 'Evidência enviada', icon: Send }
  if (next === 'CONCLUIDO') return { label: 'Execução aprovada', icon: CheckCircle2 }
  if (next === 'REPROVADO') return { label: 'Execução reprovada', icon: XCircle }
  if (previous === 'AGUARDANDO_APROVACAO' && next === 'EM_EXECUCAO') {
    return { label: 'Execução reprovada — reaberta para retrabalho', icon: XCircle }
  }
  if (previous === 'AGUARDANDO_APROVACAO' && next === 'AGUARDANDO_EVIDENCIAS') {
    return { label: 'Complementação de evidências solicitada', icon: Send }
  }
  if (previous === 'REPROVADO' && next === 'EM_EXECUCAO') return { label: 'Reaberta para retrabalho', icon: RefreshCcw }
  if (!previous) return { label: `Status definido como "${avuStatusLabel(next)}"`, icon: FileEdit }
  return { label: `Status alterado de "${avuStatusLabel(previous)}" para "${avuStatusLabel(next)}"`, icon: FileEdit }
}

export function AvuTimeline({ avuId }: { avuId: string }) {
  const auditQuery = useQuery({
    queryKey: ['avus', avuId, 'audit-logs'],
    queryFn: () => listAuditLogsForEntity('avus', avuId),
  })
  const historyQuery = useQuery({
    queryKey: ['avus', avuId, 'status-history'],
    queryFn: () => listStatusHistory(avuId),
  })
  const evidencesQuery = useQuery({
    queryKey: ['avus', avuId, 'evidences'],
    queryFn: () => listEvidences(avuId),
  })
  const sapRecordsQuery = useQuery({
    queryKey: ['avus', avuId, 'sap-records'],
    queryFn: () => listRecordsForAvu(avuId),
  })

  const isLoading = auditQuery.isLoading || historyQuery.isLoading || evidencesQuery.isLoading || sapRecordsQuery.isLoading
  if (isLoading) return <LoadingState label="Carregando histórico..." />

  const entries: TimelineEntry[] = [
    // 'avu.viewed' ("quem acessou") não aparece aqui — é ruído para o usuário comum;
    // fica disponível na página de Auditoria, que é o lugar certo pra esse dado.
    ...(auditQuery.data ?? [])
      .filter((entry) => entry.action !== 'avu.viewed')
      .map((entry) => {
        if (entry.action === 'avu.updated') {
          const { label, comment } = describeAuditChanges(entry.metadata)
          return { id: `audit-${entry.id}`, createdAt: entry.createdAt, actorName: entry.actorName, icon: FileEdit, label, comment }
        }
        const config = ACTION_CONFIG[entry.action]
        return {
          id: `audit-${entry.id}`,
          createdAt: entry.createdAt,
          actorName: entry.actorName,
          icon: config?.icon ?? Circle,
          label: config?.label ?? entry.action,
        }
      }),
    ...(historyQuery.data ?? []).map((entry) => {
      const { label, icon } = describeStatusChange(entry.previousStatus, entry.newStatus)
      return {
        id: `history-${entry.id}`,
        createdAt: entry.createdAt,
        actorName: entry.changedByName,
        icon,
        label,
        comment: entry.comment,
      }
    }),
    ...(evidencesQuery.data ?? []).map((entry) => ({
      id: `evidence-${entry.id}`,
      createdAt: entry.dataUpload,
      actorName: entry.usuarioNome,
      icon: EVIDENCE_ICON[entry.tipo],
      label: EVIDENCE_LABEL[entry.tipo],
      comment: entry.descricao,
    })),
    ...(sapRecordsQuery.data ?? []).map((entry) => ({
      id: `sap-${entry.id}`,
      createdAt: entry.createdAt,
      actorName: 'Importação SAP',
      icon: Link2,
      label: `Nota SAP vinculada${entry.om ? ` (OM ${entry.om})` : ''}`,
      comment: entry.nota ? `Nota ${entry.nota}` : null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (entries.length === 0) {
    return <EmptyState icon={ShieldAlert} title="Sem histórico" description="Nenhum evento registrado ainda." />
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => {
        const Icon = entry.icon
        const isMultilineComment = !!entry.comment && entry.comment.includes('\n')
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Icon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-graphite-800">{entry.label}</p>
              {entry.comment &&
                (isMultilineComment ? (
                  <p className="mt-0.5 whitespace-pre-line text-sm text-graphite-600">{entry.comment}</p>
                ) : (
                  <p className="mt-0.5 text-sm text-graphite-600">"{entry.comment}"</p>
                ))}
              <p className="text-xs text-gray-500">
                {entry.actorName} · {formatDateTime(entry.createdAt)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
