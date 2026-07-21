import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import { deleteAttachment, getAttachmentUrl, listAttachments, uploadAttachment } from '../avuService'
import { canWriteAvuRelated } from '../permissions'
import type { AvuAttachment, AvuAttachmentKind } from '../types'

export function AvuAttachments({ avuId, kind }: { avuId: string; kind: AvuAttachmentKind }) {
  const { user, permissions, isAdmin } = useAuth()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryKey = ['avus', avuId, 'attachments', kind]

  const attachmentsQuery = useQuery({ queryKey, queryFn: () => listAttachments(avuId, kind) })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(avuId, kind, file, user!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => show({ tone: 'error', title: 'Erro ao enviar arquivo', description: String(error) }),
  })

  const deleteMutation = useMutation({
    mutationFn: (attachment: AvuAttachment) => deleteAttachment(attachment.id, attachment.filePath),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => show({ tone: 'error', title: 'Erro ao excluir arquivo', description: String(error) }),
  })

  const canUpload = canWriteAvuRelated(permissions, isAdmin)
  const kindLabel = kind === 'photo' ? 'foto' : 'documento'

  if (attachmentsQuery.isLoading) return <LoadingState label={`Carregando ${kindLabel}s...`} />

  return (
    <div className="flex flex-col gap-4">
      {canUpload && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={kind === 'photo' ? 'image/*' : undefined}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) uploadMutation.mutate(file)
              event.target.value = ''
            }}
          />
          <Button
            variant="outline"
            size="sm"
            isLoading={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            Enviar {kindLabel}
          </Button>
        </div>
      )}

      {!attachmentsQuery.data || attachmentsQuery.data.length === 0 ? (
        <EmptyState title={`Sem ${kindLabel}s`} description={`Nenhum ${kindLabel} enviado ainda.`} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attachmentsQuery.data.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              onDelete={() => deleteMutation.mutate(attachment)}
              canDelete={canUpload}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function AttachmentCard({
  attachment,
  onDelete,
  canDelete,
}: {
  attachment: AvuAttachment
  onDelete: () => void
  canDelete: boolean
}) {
  const urlQuery = useQuery({
    queryKey: ['avu-attachment-url', attachment.filePath],
    queryFn: () => getAttachmentUrl(attachment.filePath),
  })

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => urlQuery.data && window.open(urlQuery.data, '_blank', 'noopener')}
        className="flex h-32 items-center justify-center bg-gray-50"
      >
        {attachment.kind === 'photo' && urlQuery.data ? (
          <img src={urlQuery.data} alt={attachment.fileName} className="h-full w-full object-cover" />
        ) : (
          <FileText className="size-8 text-gray-400" />
        )}
      </button>
      <div className="flex items-center justify-between gap-2 p-2">
        <p className="truncate text-xs text-graphite-700" title={attachment.fileName}>
          {attachment.fileName}
        </p>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Excluir arquivo"
            className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-magenta-600"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </li>
  )
}
