import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, Paperclip, Upload, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Textarea } from '@/components/Textarea'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import { submitEvidence } from '@/features/avus/avuService'
import { uploadEvidences } from '../evidenceService'
import type { EvidenceSubmissionContext } from '../types'

const EMPTY_CONTEXT: EvidenceSubmissionContext = {
  descricao: '',
  dataExecucao: '',
  equipe: '',
  equipamentos: '',
  latitude: null,
  longitude: null,
}

export function EvidenceUploadForm({ avuId, onSubmitted }: { avuId: string; onSubmitted: () => void }) {
  const { user } = useAuth()
  const { show } = useToast()
  const queryClient = useQueryClient()

  const [files, setFiles] = useState<File[]>([])
  const [context, setContext] = useState<EvidenceSubmissionContext>(EMPTY_CONTEXT)
  const [isLocating, setIsLocating] = useState(false)

  const submitMutation = useMutation({
    mutationFn: async () => {
      await uploadEvidences(avuId, user!.id, files, context)
      await submitEvidence(avuId, context.descricao.trim() || undefined)
    },
    onSuccess: () => {
      show({ tone: 'success', title: 'Evidências enviadas', description: 'A AVU foi marcada como Aguardando aprovação.' })
      setFiles([])
      setContext(EMPTY_CONTEXT)
      queryClient.invalidateQueries({ queryKey: ['avus', avuId] })
      queryClient.invalidateQueries({ queryKey: ['avus', avuId, 'evidences'] })
      onSubmitted()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao enviar evidências', description: String(error) }),
  })

  function captureLocation() {
    if (!navigator.geolocation) {
      show({ tone: 'error', title: 'Localização indisponível', description: 'Este navegador não suporta geolocalização.' })
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setContext((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }))
        setIsLocating(false)
      },
      (error) => {
        show({ tone: 'error', title: 'Não foi possível capturar a localização', description: error.message })
        setIsLocating(false)
      },
    )
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const canSubmit = files.length > 0 && !submitMutation.isPending

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          id="evidence-files"
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? [])
            setFiles((current) => [...current, ...selected])
            event.target.value = ''
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('evidence-files')?.click()}>
          <Paperclip className="size-4" />
          Selecionar fotos, vídeos ou documentos
        </Button>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="truncate text-graphite-700">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`Remover ${file.name}`}
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-magenta-600"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Textarea
        label="Observações"
        placeholder="Descreva o que foi executado (opcional)"
        rows={2}
        value={context.descricao}
        onChange={(event) => setContext((current) => ({ ...current, descricao: event.target.value }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Data de execução"
          type="date"
          value={context.dataExecucao}
          onChange={(event) => setContext((current) => ({ ...current, dataExecucao: event.target.value }))}
        />
        <Input
          label="Equipe"
          placeholder="Nomes da equipe envolvida"
          value={context.equipe}
          onChange={(event) => setContext((current) => ({ ...current, equipe: event.target.value }))}
        />
        <Input
          label="Equipamentos"
          placeholder="Equipamentos utilizados"
          value={context.equipamentos}
          onChange={(event) => setContext((current) => ({ ...current, equipamentos: event.target.value }))}
          className="sm:col-span-2"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" isLoading={isLocating} onClick={captureLocation}>
          <MapPin className="size-4" />
          Capturar localização
        </Button>
        {context.latitude !== null && context.longitude !== null && (
          <span className="text-xs text-gray-500">
            {context.latitude.toFixed(6)}, {context.longitude.toFixed(6)}
          </span>
        )}
      </div>

      <div>
        <Button type="button" disabled={!canSubmit} isLoading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
          <Upload className="size-4" />
          Enviar evidências
        </Button>
      </div>
    </div>
  )
}
