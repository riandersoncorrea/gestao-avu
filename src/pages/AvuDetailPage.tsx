import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ClipboardCheck, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/Card'
import { Button } from '@/components/Button'
import { Tabs } from '@/components/Tabs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Textarea } from '@/components/Textarea'
import { useToast } from '@/components/Toast'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { deleteAvu, getAvuById, getStatusSince, submitEvidence } from '@/features/avus/avuService'
import { logAvuAccessOnce } from '@/services/auditLogService'
import { AvuStatusBadge } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import { RiskBadge } from '@/features/avus/components/RiskBadge'
import { AvuLocationMap } from '@/features/avus/components/AvuLocationMap'
import { AvuAttachments } from '@/features/avus/components/AvuAttachments'
import { AvuTimeline } from '@/features/avus/components/AvuTimeline'
import { AvuComments } from '@/features/avus/components/AvuComments'
import { EvidenceList } from '@/features/contractors/components/EvidenceList'
import { computeSlaStatus } from '@/features/avus/sla'
import { StatusTransitionControl } from '@/features/planning/components/StatusTransitionControl'
import { getPlanningNextStatuses } from '@/features/planning/transitions'
import { formatDate, formatDateTime } from '@/utils/format'
import { ROUTES } from '@/lib/routes'

type TabKey =
  | 'resumo'
  | 'informacoes'
  | 'localizacao'
  | 'documentos'
  | 'fotos'
  | 'evidencias'
  | 'historico'
  | 'comentarios'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'informacoes', label: 'Informações' },
  { key: 'localizacao', label: 'Localização' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'evidencias', label: 'Evidências' },
  { key: 'historico', label: 'Histórico' },
  { key: 'comentarios', label: 'Comentários' },
]

export function AvuDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { user, roles, isAdmin, hasPermission } = useAuth()
  const [tab, setTab] = useState<TabKey>('resumo')
  const [evidenceNote, setEvidenceNote] = useState('')

  const deleteDialog = useDisclosure()
  const evidenceDialog = useDisclosure()

  const avuQuery = useQuery({ queryKey: ['avus', id], queryFn: () => getAvuById(id!) })
  const statusSinceQuery = useQuery({ queryKey: ['avus', id, 'status-since'], queryFn: () => getStatusSince(id!) })

  useEffect(() => {
    if (id) logAvuAccessOnce(id)
  }, [id])

  function invalidateAvu() {
    queryClient.invalidateQueries({ queryKey: ['avus', id] })
    queryClient.invalidateQueries({ queryKey: ['avus', id, 'audit-logs'] })
    queryClient.invalidateQueries({ queryKey: ['avus', id, 'status-history'] })
    queryClient.invalidateQueries({ queryKey: ['avus', id, 'status-since'] })
    queryClient.invalidateQueries({ queryKey: ['avus', 'list'] })
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteAvu(id!),
    onSuccess: () => {
      show({ tone: 'success', title: 'AVU excluída' })
      navigate(ROUTES.avus)
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao excluir', description: String(error) }),
  })

  const evidenceMutation = useMutation({
    mutationFn: () => submitEvidence(id!, evidenceNote.trim() || undefined),
    onSuccess: () => {
      show({ tone: 'success', title: 'Evidência enviada' })
      setEvidenceNote('')
      evidenceDialog.close()
      invalidateAvu()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao enviar evidência', description: String(error) }),
  })

  if (avuQuery.isLoading) return <LoadingState />
  if (!avuQuery.data) {
    return <EmptyState title="AVU não encontrada" description="Verifique se o link está correto." />
  }

  const avu = avuQuery.data
  const sla = computeSlaStatus(avu.dataLimite, avu.status)
  const avuWithStatusSince = { ...avu, statusSince: statusSinceQuery.data ?? avu.createdAt }

  const canEdit =
    isAdmin || hasPermission('avus.create') || (roles.includes('planejamento') && hasPermission('planning.manage'))
  const canReview =
    (isAdmin || (roles.includes('fiscal') && avu.fiscal?.id === user?.id)) && avu.status === 'AGUARDANDO_APROVACAO'
  const canSubmitEvidence =
    roles.includes('contratada') && ['EM_EXECUCAO', 'AGUARDANDO_EVIDENCIAS'].includes(avu.status)
  const canTransitionStatus = canEdit && getPlanningNextStatuses(avu.status).length > 0

  return (
    <div>
      <PageHeader
        title={avu.numeroAvu}
        description={avu.descricao}
        actions={
          <>
            {canEdit && (
              <Button variant="outline" onClick={() => navigate(`${ROUTES.avus}/${avu.id}/editar`)}>
                <Pencil className="size-4" />
                Editar
              </Button>
            )}
            {isAdmin && (
              <Button variant="danger" onClick={deleteDialog.open}>
                <Trash2 className="size-4" />
                Excluir
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <AvuStatusBadge status={avu.status} />
        <SlaBadge dataLimite={avu.dataLimite} status={avu.status} />
        <PriorityBadge prioridade={avu.prioridade} />
        <RiskBadge avu={avuWithStatusSince} />
      </div>

      <Tabs className="mb-4" tabs={TABS} activeKey={tab} onChange={(key) => setTab(key as TabKey)} />

      {tab === 'resumo' && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Categoria" value={avu.categoria} />
              <Field label="Local" value={avu.local} />
              <Field label="Gerência responsável" value={avu.gerenciaResponsavel} />
              <Field label="Data de criação" value={formatDate(avu.dataCriacao)} />
              <Field label="Data limite" value={avu.dataLimite ? formatDate(avu.dataLimite) : null} />
              <Field
                label="Dias até o prazo / atraso"
                value={
                  sla.daysUntilDue === null
                    ? null
                    : sla.daysUntilDue >= 0
                      ? `${sla.daysUntilDue} dia(s) restantes`
                      : `${sla.daysOverdue} dia(s) em atraso`
                }
              />
              <Field label="Responsável" value={avu.responsavel?.fullName} />
              <Field label="Fiscal" value={avu.fiscal?.fullName} />
              <Field label="Empresa executante" value={avu.empresaExecutante} />
            </CardContent>
          </Card>

          {canTransitionStatus && (
            <Card>
              <CardContent>
                <StatusTransitionControl avu={avu} onChanged={invalidateAvu} />
              </CardContent>
            </Card>
          )}

          {canReview && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm text-graphite-700">
                  Esta AVU está aguardando sua análise (aprovar, reprovar ou solicitar complementação de evidências).
                </p>
                <Button onClick={() => navigate(`${ROUTES.inspections}/${avu.id}`)}>
                  <ClipboardCheck className="size-4" />
                  Analisar na Fiscalização
                </Button>
              </CardContent>
            </Card>
          )}

          {canSubmitEvidence && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm font-medium text-graphite-800">Enviar evidência (Contratada)</p>
                <Textarea
                  placeholder="Observação (opcional)"
                  value={evidenceNote}
                  onChange={(event) => setEvidenceNote(event.target.value)}
                  rows={2}
                />
                <div>
                  <Button onClick={evidenceDialog.open}>Enviar evidência</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'informacoes' && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Emitente" value={avu.emitente?.fullName} />
            <Field label="Projeto" value={avu.projeto} />
            <Field label="Subcategoria" value={avu.subcategoria} />
            <Field
              label="Nível de confiança IA"
              value={avu.nivelConfiancaIa !== null ? `${avu.nivelConfiancaIa}%` : null}
            />
            <Field label="Nota SAP" value={avu.notaSap} />
            <Field label="Ordem de manutenção" value={avu.ordemManutencao} />
            <Field label="Status desde" value={formatDateTime(avuWithStatusSince.statusSince)} />
            <Field label="Criada em" value={formatDateTime(avu.createdAt)} />
            <Field label="Última atualização" value={formatDateTime(avu.updatedAt)} />
          </CardContent>
        </Card>
      )}

      {tab === 'localizacao' && <AvuLocationMap avu={avu} />}
      {tab === 'documentos' && <AvuAttachments avuId={avu.id} kind="document" />}
      {tab === 'fotos' && <AvuAttachments avuId={avu.id} kind="photo" />}
      {tab === 'evidencias' && <EvidenceList avuId={avu.id} />}
      {tab === 'historico' && <AvuTimeline avuId={avu.id} />}
      {tab === 'comentarios' && <AvuComments avuId={avu.id} />}

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => deleteMutation.mutate()}
        title="Excluir AVU"
        description="Esta ação é permanente e não pode ser desfeita. Considere mudar o status para Cancelado em vez de excluir, para manter o histórico."
        confirmLabel="Excluir"
        isDestructive
        isLoading={deleteMutation.isPending}
      />
      <ConfirmDialog
        isOpen={evidenceDialog.isOpen}
        onClose={evidenceDialog.close}
        onConfirm={() => evidenceMutation.mutate()}
        title="Enviar evidência"
        description="A AVU será marcada como Aguardando aprovação."
        confirmLabel="Enviar"
        isLoading={evidenceMutation.isPending}
      />
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
