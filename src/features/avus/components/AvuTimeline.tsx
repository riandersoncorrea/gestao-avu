import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, FileEdit, Send, ShieldAlert, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { listAuditLogsForEntity } from '@/services/auditLogService'
import { formatDateTime } from '@/utils/format'
import { avuStatusLabel } from './AvuStatusBadge'
import type { AvuStatus } from '../types'

const ACTION_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  'avu.created': { label: 'AVU criada', icon: Circle },
  'avu.updated': { label: 'Dados atualizados', icon: FileEdit },
  'avu.status_changed': { label: 'Status alterado', icon: FileEdit },
  'avu.evidence_submitted': { label: 'Evidência enviada', icon: Send },
  'avu.approved': { label: 'Execução aprovada', icon: CheckCircle2 },
  'avu.rejected': { label: 'Execução reprovada', icon: XCircle },
}

function describeAction(action: string, metadata: Record<string, unknown> | null): string {
  const config = ACTION_CONFIG[action]
  if (action === 'avu.status_changed' && metadata) {
    const from = metadata.from as AvuStatus | undefined
    const to = metadata.to as AvuStatus | undefined
    if (from && to) return `Status alterado de "${avuStatusLabel(from)}" para "${avuStatusLabel(to)}"`
  }
  return config?.label ?? action
}

export function AvuTimeline({ avuId }: { avuId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['avus', avuId, 'timeline'],
    queryFn: () => listAuditLogsForEntity('avus', avuId),
  })

  if (isLoading) return <LoadingState label="Carregando histórico..." />
  if (!data || data.length === 0) {
    return <EmptyState icon={ShieldAlert} title="Sem histórico" description="Nenhum evento registrado ainda." />
  }

  return (
    <ol className="flex flex-col gap-4">
      {data.map((entry) => {
        const Icon = ACTION_CONFIG[entry.action]?.icon ?? Circle
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Icon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-graphite-800">
                {describeAction(entry.action, entry.metadata)}
              </p>
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
