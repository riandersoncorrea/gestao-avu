import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Textarea } from '@/components/Textarea'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import { addComment, listComments } from '../avuService'
import { canWriteAvuRelated } from '../permissions'
import { formatDateTime } from '@/utils/format'

export function AvuComments({ avuId }: { avuId: string }) {
  const { user, permissions, isAdmin } = useAuth()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')

  const commentsQuery = useQuery({ queryKey: ['avus', avuId, 'comments'], queryFn: () => listComments(avuId) })

  const addCommentMutation = useMutation({
    mutationFn: () => addComment(avuId, user!.id, body.trim()),
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['avus', avuId, 'comments'] })
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao comentar', description: String(error) }),
  })

  const canComment = canWriteAvuRelated(permissions, isAdmin)

  if (commentsQuery.isLoading) return <LoadingState label="Carregando comentários..." />

  return (
    <div className="flex flex-col gap-4">
      {canComment && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (body.trim()) addCommentMutation.mutate()
          }}
        >
          <Textarea
            placeholder="Escreva um comentário..."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" isLoading={addCommentMutation.isPending} disabled={!body.trim()}>
              <Send className="size-4" />
              Comentar
            </Button>
          </div>
        </form>
      )}

      {!commentsQuery.data || commentsQuery.data.length === 0 ? (
        <EmptyState title="Sem comentários" description="Seja o primeiro a comentar nesta AVU." />
      ) : (
        <ul className="flex flex-col gap-4">
          {commentsQuery.data.map((comment) => (
            <li key={comment.id} className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm text-graphite-700">{comment.body}</p>
              <p className="mt-2 text-xs text-gray-500">
                {comment.authorName} · {formatDateTime(comment.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
