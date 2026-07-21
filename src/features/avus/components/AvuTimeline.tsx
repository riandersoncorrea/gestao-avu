import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, FileEdit, RefreshCcw, Send, ShieldAlert, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { listAuditLogsForEntity } from '@/services/auditLogService'
import { formatDateTime } from '@/utils/format'
import { listStatusHistory } from '../avuService'
import { avuStatusLabel } from './AvuStatusBadge'
import type { AvuStatus } from '../types'

const ACTION_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  'avu.created': { label: 'AVU criada', icon: Circle },
  'avu.updated': { label: 'Dados atualizados', icon: FileEdit },
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

  if (auditQuery.isLoading || historyQuery.isLoading) return <LoadingState label="Carregando histórico..." />

  const entries: TimelineEntry[] = [
    ...(auditQuery.data ?? []).map((entry) => ({
      id: `audit-${entry.id}`,
      createdAt: entry.createdAt,
      actorName: entry.actorName,
      icon: ACTION_CONFIG[entry.action]?.icon ?? Circle,
      label: ACTION_CONFIG[entry.action]?.label ?? entry.action,
    })),
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
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (entries.length === 0) {
    return <EmptyState icon={ShieldAlert} title="Sem histórico" description="Nenhum evento registrado ainda." />
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => {
        const Icon = entry.icon
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Icon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-graphite-800">{entry.label}</p>
              {entry.comment && <p className="mt-0.5 text-sm text-graphite-600">"{entry.comment}"</p>}
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
