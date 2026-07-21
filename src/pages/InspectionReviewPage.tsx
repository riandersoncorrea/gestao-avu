import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, MessageSquarePlus, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Textarea } from '@/components/Textarea'
import { useToast } from '@/components/Toast'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { getAvuById } from '@/features/avus/avuService'
import { AvuStatusBadge } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import { AvuAttachments } from '@/features/avus/components/AvuAttachments'
import { AvuComments } from '@/features/avus/components/AvuComments'
import { EvidenceList } from '@/features/contractors/components/EvidenceList'
import { reviewEvidence } from '@/features/inspections/approvalService'
import type { ApprovalDecision } from '@/features/inspections/types'
import { formatDate } from '@/utils/format'
import { ROUTES } from '@/lib/routes'

export function InspectionReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { user, roles, isAdmin } = useAuth()
  const [comment, setComment] = useState('')
  const [pendingDecision, setPendingDecision] = useState<ApprovalDecision | null>(null)

  const dialog = useDisclosure()

  const avuQuery = useQuery({ queryKey: ['avus', id], queryFn: () => getAvuById(id!) })

  const reviewMutation = useMutation({
    mutationFn: (decision: ApprovalDecision) => reviewEvidence(id!, decision, comment.trim() || undefined),
    onSuccess: () => {
      show({ tone: 'success', title: 'Decisão registrada' })
      setComment('')
      dialog.close()
      queryClient.invalidateQueries({ queryKey: ['avus', id] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao registrar decisão', description: String(error) }),
  })

  if (avuQuery.isLoading) return <LoadingState />
  if (!avuQuery.data) {
    return <EmptyState title="AVU não encontrada" description="Verifique se o link está correto." />
  }

  const avu = avuQuery.data
  const canReview =
    (isAdmin || (roles.includes('fiscal') && avu.fiscal?.id === user?.id)) && avu.status === 'AGUARDANDO_APROVACAO'

  function openDialog(decision: ApprovalDecision) {
    setPendingDecision(decision)
    dialog.open()
  }

  const DECISION_CONFIG: Record<ApprovalDecision, { title: string; confirmLabel: string; description: string }> = {
    aprovado: {
      title: 'Aprovar execução',
      confirmLabel: 'Aprovar',
      description: 'A AVU será marcada como Concluída.',
    },
    reprovado: {
      title: 'Reprovar execução',
      confirmLabel: 'Reprovar',
      description: 'A AVU voltará para Em execução.',
    },
    complementacao: {
      title: 'Solicitar complementação de evidências',
      confirmLabel: 'Solicitar',
      description: 'A AVU voltará para Aguardando evidências.',
    },
  }

  return (
    <div>
      <PageHeader
        title={avu.numeroAvu}
        description={avu.descricao}
        actions={
          <Button variant="outline" onClick={() => navigate(ROUTES.inspections)}>
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <AvuStatusBadge status={avu.status} />
        <SlaBadge dataLimite={avu.dataLimite} status={avu.status} />
        <PriorityBadge prioridade={avu.prioridade} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Dados do AVU</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Localização" value={avu.local} />
          <Field label="Prazo" value={avu.dataLimite ? formatDate(avu.dataLimite) : null} />
          <Field label="Categoria" value={avu.categoria} />
          <Field label="Nota SAP" value={avu.notaSap} />
          <Field label="Ordem de manutenção" value={avu.ordemManutencao} />
          <Field label="Empresa" value={avu.empresaExecutante} />
          <Field label="Responsável" value={avu.responsavel?.fullName} />
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fotos ANTES</CardTitle>
          </CardHeader>
          <CardContent>
            <AvuAttachments avuId={avu.id} kind="photo" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fotos DEPOIS</CardTitle>
          </CardHeader>
          <CardContent>
            <EvidenceList avuId={avu.id} tipoFilter="foto" />
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Vídeos</CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenceList avuId={avu.id} tipoFilter="video" />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvuAttachments avuId={avu.id} kind="document" />
          <EvidenceList avuId={avu.id} tipoFilter="documento" />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Comentários</CardTitle>
        </CardHeader>
        <CardContent>
          <AvuComments avuId={avu.id} />
        </CardContent>
      </Card>

      {canReview && (
        <Card>
          <CardHeader>
            <CardTitle>Decisão</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => openDialog('aprovado')}>
              <CheckCircle2 className="size-4" />
              Aprovar
            </Button>
            <Button variant="danger" onClick={() => openDialog('reprovado')}>
              <XCircle className="size-4" />
              Reprovar
            </Button>
            <Button variant="outline" onClick={() => openDialog('complementacao')}>
              <MessageSquarePlus className="size-4" />
              Solicitar complementação
            </Button>
          </CardContent>
        </Card>
      )}

      {pendingDecision && (
        <ConfirmDialog
          isOpen={dialog.isOpen}
          onClose={dialog.close}
          onConfirm={() => reviewMutation.mutate(pendingDecision)}
          title={DECISION_CONFIG[pendingDecision].title}
          description={DECISION_CONFIG[pendingDecision].description}
          confirmLabel={DECISION_CONFIG[pendingDecision].confirmLabel}
          isDestructive={pendingDecision === 'reprovado'}
          isLoading={reviewMutation.isPending}
        >
          <Textarea
            label="Comentário"
            placeholder="Observação (opcional)"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
          />
        </ConfirmDialog>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-graphite-800">{value || '—'}</p>
    </div>
  )
}
