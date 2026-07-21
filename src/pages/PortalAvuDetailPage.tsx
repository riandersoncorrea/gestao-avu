import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Tabs } from '@/components/Tabs'
import { useAuth } from '@/features/auth/AuthContext'
import { getAvuById } from '@/features/avus/avuService'
import { AvuStatusBadge } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import { AvuTimeline } from '@/features/avus/components/AvuTimeline'
import { EvidenceUploadForm } from '@/features/contractors/components/EvidenceUploadForm'
import { EvidenceList } from '@/features/contractors/components/EvidenceList'
import { formatDate } from '@/utils/format'
import { ROUTES } from '@/lib/routes'

type TabKey = 'detalhes' | 'evidencias' | 'historico'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'detalhes', label: 'Detalhes' },
  { key: 'evidencias', label: 'Evidências' },
  { key: 'historico', label: 'Histórico' },
]

export function PortalAvuDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { roles } = useAuth()
  const [tab, setTab] = useState<TabKey>('detalhes')

  const avuQuery = useQuery({ queryKey: ['avus', id], queryFn: () => getAvuById(id!) })

  if (avuQuery.isLoading) return <LoadingState />
  if (!avuQuery.data) {
    return <EmptyState title="AVU não encontrada" description="Verifique se o link está correto." />
  }

  const avu = avuQuery.data
  const canSubmitEvidence =
    roles.includes('contratada') && ['EM_EXECUCAO', 'AGUARDANDO_EVIDENCIAS'].includes(avu.status)

  return (
    <div>
      <PageHeader
        title={avu.numeroAvu}
        description={avu.descricao}
        actions={
          <Button variant="outline" onClick={() => navigate(`${ROUTES.portal}/avus`)}>
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

      <Tabs className="mb-4" tabs={TABS} activeKey={tab} onChange={(key) => setTab(key as TabKey)} />

      {tab === 'detalhes' && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Local" value={avu.local} />
            <Field label="Categoria" value={avu.categoria} />
            <Field label="Prazo" value={avu.dataLimite ? formatDate(avu.dataLimite) : null} />
            <Field label="Nota SAP" value={avu.notaSap} />
            <Field label="Ordem de manutenção" value={avu.ordemManutencao} />
            <Field label="Fiscal responsável" value={avu.fiscal?.fullName} />
          </CardContent>
        </Card>
      )}

      {tab === 'evidencias' && (
        <div className="flex flex-col gap-6">
          {canSubmitEvidence && (
            <Card>
              <CardHeader>
                <CardTitle>Enviar evidências</CardTitle>
              </CardHeader>
              <CardContent>
                <EvidenceUploadForm avuId={avu.id} onSubmitted={() => avuQuery.refetch()} />
              </CardContent>
            </Card>
          )}
          <EvidenceList avuId={avu.id} />
        </div>
      )}

      {tab === 'historico' && <AvuTimeline avuId={avu.id} />}
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
