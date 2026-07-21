import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Film, Image as ImageIcon, MapPin, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate, formatDateTime } from '@/utils/format'
import { deleteEvidence, getEvidenceUrl, listEvidences } from '../evidenceService'
import type { AvuEvidence, EvidenceTipo } from '../types'

const TIPO_ICON: Record<EvidenceTipo, LucideIcon> = {
  foto: ImageIcon,
  video: Film,
  documento: FileText,
}

const TIPO_LABEL: Record<EvidenceTipo, string> = {
  foto: 'Foto',
  video: 'Vídeo',
  documento: 'Documento',
}

export function EvidenceList({ avuId }: { avuId: string }) {
  const { user, isAdmin } = useAuth()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const queryKey = ['avus', avuId, 'evidences']

  const evidencesQuery = useQuery({ queryKey, queryFn: () => listEvidences(avuId) })

  const deleteMutation = useMutation({
    mutationFn: (evidence: AvuEvidence) => deleteEvidence(evidence.id, evidence.arquivo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => show({ tone: 'error', title: 'Erro ao excluir evidência', description: String(error) }),
  })

  if (evidencesQuery.isLoading) return <LoadingState label="Carregando evidências..." />
  if (!evidencesQuery.data || evidencesQuery.data.length === 0) {
    return <EmptyState title="Sem evidências" description="Nenhuma evidência enviada para esta AVU ainda." />
  }

  return (
    <ul className="flex flex-col gap-3">
      {evidencesQuery.data.map((evidence) => (
        <EvidenceItem
          key={evidence.id}
          evidence={evidence}
          canDelete={isAdmin || evidence.usuario === user?.id}
          onDelete={() => deleteMutation.mutate(evidence)}
        />
      ))}
    </ul>
  )
}

function EvidenceItem({
  evidence,
  canDelete,
  onDelete,
}: {
  evidence: AvuEvidence
  canDelete: boolean
  onDelete: () => void
}) {
  const urlQuery = useQuery({
    queryKey: ['avu-evidence-url', evidence.arquivo],
    queryFn: () => getEvidenceUrl(evidence.arquivo),
  })

  const Icon = TIPO_ICON[evidence.tipo]

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icon className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => urlQuery.data && window.open(urlQuery.data, '_blank', 'noopener')}
            className="text-left text-sm font-medium text-graphite-800 hover:underline"
          >
            {evidence.nomeArquivo}
          </button>
          <p className="text-xs text-gray-500">
            {TIPO_LABEL[evidence.tipo]} · {evidence.usuarioNome} · {formatDateTime(evidence.dataUpload)}
          </p>
          {evidence.descricao && <p className="text-sm text-graphite-600">{evidence.descricao}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {evidence.dataExecucao && <span>Execução: {formatDate(evidence.dataExecucao)}</span>}
            {evidence.equipe && <span>Equipe: {evidence.equipe}</span>}
            {evidence.equipamentos && <span>Equipamentos: {evidence.equipamentos}</span>}
            {evidence.latitude !== null && evidence.longitude !== null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {evidence.latitude.toFixed(6)}, {evidence.longitude.toFixed(6)}
              </span>
            )}
          </div>
        </div>
      </div>

      {canDelete && (
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Excluir ${evidence.nomeArquivo}`}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  )
}
