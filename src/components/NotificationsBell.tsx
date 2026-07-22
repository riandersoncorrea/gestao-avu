import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { listMyNotifications, markAllAsRead, markAsRead } from '@/services/notificationService'
import { useDisclosure } from '@/hooks/useDisclosure'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'
import type { AppNotification } from '@/types'

export function NotificationsBell() {
  const { isOpen, toggle, close } = useDisclosure(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: listMyNotifications,
    refetchInterval: 30_000,
  })

  const notifications = notificationsQuery.data ?? []
  const unreadCount = notifications.filter((n) => !n.readAt).length

  const markReadMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllAsRead(notifications.filter((n) => !n.readAt).map((n) => n.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, close])

  function handleSelect(notification: AppNotification) {
    if (!notification.readAt) markReadMutation.mutate(notification.id)
    if (notification.entity === 'avus' && notification.entityId) {
      navigate(`/avus/${notification.entityId}`)
    }
    close()
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificações"
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-magenta-600 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-graphite-800">Notificações</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <EmptyState
                title="Sem notificações"
                description="Você será avisado quando houver novidades nas suas AVUs."
                className="border-none px-4 py-8"
              />
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(notification)}
                      className={cn(
                        'flex w-full flex-col gap-0.5 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50',
                        !notification.readAt && 'bg-primary-50/50',
                      )}
                    >
                      <p className="text-sm font-medium text-graphite-800">{notification.title}</p>
                      <p className="text-xs text-graphite-600">{notification.body}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(notification.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              close()
              navigate(ROUTES.notifications)
            }}
            className="block w-full border-t border-gray-100 px-4 py-2.5 text-center text-xs font-medium text-primary-600 hover:bg-gray-50"
          >
            Ver todas as notificações
          </button>
        </div>
      )}
    </div>
  )
}
