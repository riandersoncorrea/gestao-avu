import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Select } from '@/components/Select'
import { Textarea } from '@/components/Textarea'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import type { Avu, AvuStatus } from '@/features/avus/types'
import { transitionStatus } from '../planningService'
import { getPlanningNextStatuses } from '../transitions'

export function StatusTransitionControl({ avu, onChanged }: { avu: Avu; onChanged?: () => void }) {
  const { isAdmin, hasPermission, roles } = useAuth()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const dialog = useDisclosure()
  const [selected, setSelected] = useState('')
  const [comment, setComment] = useState('')

  const canTransition =
    isAdmin || hasPermission('avus.create') || (roles.includes('planejamento') && hasPermission('planning.manage'))
  const nextStatuses = getPlanningNextStatuses(avu.status)

  const mutation = useMutation({
    mutationFn: () => transitionStatus(avu.id, selected as AvuStatus, comment.trim() || undefined),
    onSuccess: () => {
      show({ tone: 'success', title: 'Status atualizado', description: avuStatusLabel(selected as AvuStatus) })
      setComment('')
      setSelected('')
      dialog.close()
      queryClient.invalidateQueries({ queryKey: ['avus'] })
      onChanged?.()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao mudar status', description: String(error) }),
  })

  if (!canTransition || nextStatuses.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-graphite-800">Avançar status</p>
      <Select
        placeholder="Selecione o próximo status"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        options={nextStatuses.map((status) => ({ value: status, label: avuStatusLabel(status) }))}
      />
      <Textarea
        placeholder="Comentário (opcional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={2}
      />
      <div>
        <Button disabled={!selected} onClick={dialog.open}>
          Confirmar mudança
        </Button>
      </div>

      <ConfirmDialog
        isOpen={dialog.isOpen}
        onClose={dialog.close}
        onConfirm={() => mutation.mutate()}
        title="Confirmar mudança de status"
        description={selected ? `A AVU mudará para "${avuStatusLabel(selected as AvuStatus)}".` : undefined}
        confirmLabel="Confirmar"
        isLoading={mutation.isPending}
      />
    </div>
  )
}
