import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/Card'
import { Tabs } from '@/components/Tabs'
import { Button } from '@/components/Button'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { listAllMyNotifications, markAllAsRead, markAsRead } from '@/services/notificationService'
import { formatDateTime } from '@/utils/format'
import type { AppNotification } from '@/types'

type FilterKey = 'todas' | 'nao_lidas' | 'lidas'

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'nao_lidas', label: 'Não lidas' },
  { key: 'lidas', label: 'Lidas' },
]

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterKey>('todas')

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'all', filter],
    queryFn: () => listAllMyNotifications(filter === 'todas' ? undefined : filter),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const markReadMutation = useMutation({ mutationFn: markAsRead, onSuccess: invalidate })

  const notifications = notificationsQuery.data ?? []
  const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id)

  const markAllReadMutation = useMutation({ mutationFn: () => markAllAsRead(unreadIds), onSuccess: invalidate })

  function handleSelect(notification: AppNotification) {
    if (!notification.readAt) markReadMutation.mutate(notification.id)
    if (notification.entity === 'avus' && notification.entityId) navigate(`${ROUTES.avus}/${notification.entityId}`)
  }

  const columns: DataTableColumn<AppNotification>[] = [
    {
      key: 'status',
      header: '',
      className: 'w-8',
      render: (row) => <span className={cn('block size-2 rounded-full', !row.readAt && 'bg-primary-600')} />,
    },
    {
      key: 'title',
      header: 'Notificação',
      render: (row) => (
        <div>
          <p className="font-medium text-graphite-800">{row.title}</p>
          <p className="text-xs text-graphite-600">{row.body}</p>
        </div>
      ),
    },
    { key: 'createdAt', header: 'Recebida em', render: (row) => formatDateTime(row.createdAt) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Notificações"
        description="Central de notificações — prazos, evidências, aprovações e integrações."
        actions={
          unreadIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              isLoading={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              Marcar todas como lidas
            </Button>
          )
        }
      />

      <Tabs tabs={FILTER_TABS} activeKey={filter} onChange={(key) => setFilter(key as FilterKey)} />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={notifications}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={notificationsQuery.isLoading}
            emptyMessage="Nenhuma notificação encontrada."
            onRowClick={handleSelect}
            getRowClassName={(row) => (!row.readAt ? 'bg-primary-50/40' : undefined)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
