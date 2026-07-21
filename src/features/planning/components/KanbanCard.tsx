import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import { RiskBadge } from '@/features/avus/components/RiskBadge'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import type { Avu, AvuStatus } from '@/features/avus/types'
import { ROUTES } from '@/lib/routes'
import { transitionStatus } from '../planningService'
import { getPlanningNextStatuses } from '../transitions'
import { QuickEditModal } from './QuickEditModal'

export function KanbanCard({ avu }: { avu: Avu }) {
  const navigate = useNavigate()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const { isAdmin, hasPermission, roles } = useAuth()
  const editModal = useDisclosure()
  const [isTransitioning, setIsTransitioning] = useState(false)

  const canEdit = isAdmin || hasPermission('avus.create') || (roles.includes('planejamento') && hasPermission('planning.manage'))
  const nextStatuses = canEdit ? getPlanningNextStatuses(avu.status) : []

  const transitionMutation = useMutation({
    mutationFn: (status: AvuStatus) => transitionStatus(avu.id, status),
    onMutate: () => setIsTransitioning(true),
    onSettled: () => setIsTransitioning(false),
    onSuccess: () => {
      show({ tone: 'success', title: 'Status atualizado' })
      queryClient.invalidateQueries({ queryKey: ['avus'] })
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao mudar status', description: String(error) }),
  })

  return (
    <Card className="flex flex-col gap-2 p-3">
      <button
        type="button"
        className="text-left"
        onClick={() => navigate(`${ROUTES.avus}/${avu.id}`)}
      >
        <p className="text-sm font-semibold text-primary-700">{avu.numeroAvu}</p>
        <p className="mt-1 line-clamp-2 text-sm text-graphite-700">{avu.descricao}</p>
      </button>

      <div className="flex flex-wrap gap-1">
        {avu.categoria && <Badge color="gray">{avu.categoria}</Badge>}
        <PriorityBadge prioridade={avu.prioridade} />
        <RiskBadge avu={avu} />
      </div>

      <p className="text-xs text-gray-500">{avu.gerenciaResponsavel ?? 'Sem gerência definida'}</p>

      {canEdit && (
        <div className="mt-1 flex items-center gap-2">
          {nextStatuses.length > 0 && (
            <Select
              className="h-8 text-xs"
              placeholder="Avançar para..."
              value=""
              disabled={isTransitioning}
              onChange={(event) => transitionMutation.mutate(event.target.value as AvuStatus)}
              options={nextStatuses.map((status) => ({ value: status, label: avuStatusLabel(status) }))}
            />
          )}
          <button
            type="button"
            onClick={editModal.open}
            aria-label="Ação de planejamento"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-700"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      )}

      <QuickEditModal avu={avu} isOpen={editModal.isOpen} onClose={editModal.close} />
    </Card>
  )
}
