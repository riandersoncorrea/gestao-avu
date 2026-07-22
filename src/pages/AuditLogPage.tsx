import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/Card'
import { Select } from '@/components/Select'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { useToast } from '@/components/Toast'
import { ROUTES } from '@/lib/routes'
import { listAuditLogsFiltered, type AuditLogWithActor } from '@/services/auditLogService'
import { listProfileOptions } from '@/services/profileService'
import { generateDeadlineNotifications } from '@/services/notificationService'
import { describeAuditChanges } from '@/features/avus/describeAuditChanges'
import { formatDateTime } from '@/utils/format'

const ACTION_OPTIONS = [
  { value: '', label: 'Todas as ações' },
  { value: 'avu.created', label: 'AVU criada' },
  { value: 'avu.updated', label: 'AVU atualizada' },
  { value: 'avu.viewed', label: 'AVU visualizada' },
  { value: 'avu_import.confirm', label: 'AVU criada via importação de PDF' },
  { value: 'user_role.assigned', label: 'Perfil atribuído' },
  { value: 'user_role.removed', label: 'Perfil removido' },
  { value: 'user.activated', label: 'Usuário ativado' },
  { value: 'user.deactivated', label: 'Usuário desativado' },
]

const ENTITY_OPTIONS = [
  { value: '', label: 'Todas as entidades' },
  { value: 'avus', label: 'AVUs' },
  { value: 'profiles', label: 'Perfis' },
  { value: 'user_roles', label: 'Papéis de usuário' },
]

function actionLabel(action: string): string {
  return ACTION_OPTIONS.find((option) => option.value === action)?.label ?? action
}

function entityLabel(entity: string): string {
  return ENTITY_OPTIONS.find((option) => option.value === entity)?.label ?? entity
}

export function AuditLogPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isCheckingDeadlines, setIsCheckingDeadlines] = useState(false)

  const filters = {
    entity: entity || undefined,
    action: action || undefined,
    actorId: actorId || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59` : undefined,
  }

  const logsQuery = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => listAuditLogsFiltered(filters),
  })
  const profilesQuery = useQuery({ queryKey: ['profile-options'], queryFn: listProfileOptions })

  async function handleCheckDeadlines() {
    setIsCheckingDeadlines(true)
    try {
      const summary = await generateDeadlineNotifications()
      show({
        tone: 'success',
        title: 'Verificação concluída',
        description: `${summary.prazoProximo} notificação(ões) de prazo próximo, ${summary.vencidas} de AVU vencida.`,
      })
    } catch (error) {
      show({ tone: 'error', title: 'Falha ao verificar prazos', description: String(error) })
    }
    setIsCheckingDeadlines(false)
  }

  const columns: DataTableColumn<AuditLogWithActor>[] = [
    { key: 'createdAt', header: 'Data/Hora', render: (row) => formatDateTime(row.createdAt) },
    { key: 'actor', header: 'Usuário', render: (row) => row.actorName },
    { key: 'action', header: 'Ação', render: (row) => actionLabel(row.action) },
    { key: 'entity', header: 'Entidade', render: (row) => entityLabel(row.entity) },
    {
      key: 'detalhe',
      header: 'Detalhe',
      render: (row) => {
        if (row.action !== 'avu.updated') return '—'
        const { comment } = describeAuditChanges(row.metadata)
        return comment ? <span className="whitespace-pre-line text-xs text-graphite-600">{comment}</span> : '—'
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Auditoria"
        description="Trilha de auditoria do sistema — quem acessou, quem alterou, o que mudou."
        actions={
          <Button variant="outline" size="sm" isLoading={isCheckingDeadlines} onClick={handleCheckDeadlines}>
            <ShieldCheck className="size-4" />
            Verificar prazos agora
          </Button>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select label="Entidade" options={ENTITY_OPTIONS} value={entity} onChange={(event) => setEntity(event.target.value)} />
          <Select label="Ação" options={ACTION_OPTIONS} value={action} onChange={(event) => setAction(event.target.value)} />
          <Select
            label="Usuário"
            options={[
              { value: '', label: 'Todos os usuários' },
              ...(profilesQuery.data ?? []).map((profile) => ({ value: profile.id, label: profile.fullName })),
            ]}
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
          />
          <Input label="De" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input label="Até" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={logsQuery.data ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={logsQuery.isLoading}
            emptyMessage="Nenhum evento encontrado com esses filtros."
            onRowClick={(row) => {
              if (row.entity === 'avus' && row.entityId) navigate(`${ROUTES.avus}/${row.entityId}`)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
