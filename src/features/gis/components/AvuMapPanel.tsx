import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/LoadingState'
import { AvuStatusBadge } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { listAttachments, getAttachmentUrl } from '@/features/avus/avuService'
import type { Avu } from '@/features/avus/types'
import { formatDate } from '@/utils/format'
import { ROUTES } from '@/lib/routes'

export function AvuMapPanel({ avu, onClose }: { avu: Avu; onClose: () => void }) {
  const navigate = useNavigate()

  const photosQuery = useQuery({
    queryKey: ['avus', avu.id, 'attachments', 'photo'],
    queryFn: () => listAttachments(avu.id, 'photo'),
  })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-graphite-900/30 lg:hidden" onClick={onClose} aria-hidden />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-graphite-800">{avu.numeroAvu}</p>
            <p className="text-xs text-gray-500">Detalhes da AVU</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-2">
            <AvuStatusBadge status={avu.status} />
            <SlaBadge dataLimite={avu.dataLimite} status={avu.status} />
          </div>

          <p className="text-sm text-graphite-700">{avu.descricao}</p>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Fotos</p>
            {photosQuery.isLoading ? (
              <LoadingState label="Carregando fotos..." />
            ) : !photosQuery.data || photosQuery.data.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma foto anexada.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photosQuery.data.map((photo) => (
                  <PhotoThumb key={photo.id} filePath={photo.filePath} fileName={photo.fileName} />
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria" value={avu.categoria} />
            <Field label="Responsável" value={avu.responsavel?.fullName} />
            <Field label="Prazo" value={avu.dataLimite ? formatDate(avu.dataLimite) : null} />
            <Field label="Nota SAP" value={avu.notaSap} />
            <Field label="Ordem de manutenção" value={avu.ordemManutencao} />
            <Field label="Empresa executante" value={avu.empresaExecutante} />
            <Field label="Fiscal" value={avu.fiscal?.fullName} />
          </div>

          <Button onClick={() => navigate(`${ROUTES.avus}/${avu.id}`)}>
            <ExternalLink className="size-4" />
            Abrir detalhes
          </Button>
        </div>
      </aside>
    </>
  )
}

function PhotoThumb({ filePath, fileName }: { filePath: string; fileName: string }) {
  const urlQuery = useQuery({ queryKey: ['avu-photo-url', filePath], queryFn: () => getAttachmentUrl(filePath) })

  return (
    <button
      type="button"
      onClick={() => urlQuery.data && window.open(urlQuery.data, '_blank', 'noopener')}
      className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gray-50"
      title={fileName}
    >
      {urlQuery.data ? (
        <img src={urlQuery.data} alt={fileName} className="h-full w-full object-cover" />
      ) : (
        <FileText className="size-5 text-gray-300" />
      )}
    </button>
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
