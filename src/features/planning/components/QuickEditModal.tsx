import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/Modal'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { priorityLabel } from '@/features/avus/components/PriorityBadge'
import { AVU_PRIORITIES, type Avu } from '@/features/avus/types'
import { updatePlanningFields } from '../planningService'

export interface QuickEditModalProps {
  avu: Avu
  isOpen: boolean
  onClose: () => void
}

export function QuickEditModal({ avu, isOpen, onClose }: QuickEditModalProps) {
  const { show } = useToast()
  const queryClient = useQueryClient()
  const [notaSap, setNotaSap] = useState(avu.notaSap ?? '')
  const [ordemManutencao, setOrdemManutencao] = useState(avu.ordemManutencao ?? '')
  const [dataLimite, setDataLimite] = useState(avu.dataLimite ?? '')
  const [prioridade, setPrioridade] = useState(avu.prioridade)

  const mutation = useMutation({
    mutationFn: () =>
      updatePlanningFields(avu.id, {
        notaSap: notaSap.trim() || null,
        ordemManutencao: ordemManutencao.trim() || null,
        dataLimite: dataLimite.trim() || null,
        prioridade,
      }),
    onSuccess: () => {
      show({ tone: 'success', title: 'AVU atualizada' })
      queryClient.invalidateQueries({ queryKey: ['avus'] })
      onClose()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao atualizar', description: String(error) }),
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ação de planejamento — ${avu.numeroAvu}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nota SAP" value={notaSap} onChange={(event) => setNotaSap(event.target.value)} />
        <Input
          label="Ordem de manutenção"
          value={ordemManutencao}
          onChange={(event) => setOrdemManutencao(event.target.value)}
        />
        <Input
          label="Data limite (planejamento)"
          type="date"
          value={dataLimite}
          onChange={(event) => setDataLimite(event.target.value)}
        />
        <Select
          label="Prioridade"
          value={prioridade}
          onChange={(event) => setPrioridade(event.target.value as Avu['prioridade'])}
          options={AVU_PRIORITIES.map((value) => ({ value, label: priorityLabel(value) }))}
        />
      </div>
    </Modal>
  )
}
