import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Textarea } from '@/components/Textarea'
import { Select } from '@/components/Select'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { confirmImport, getImport, getStagingImageUrls, getStagingPdfUrl, listImportLogs } from '@/features/imports/importService'
import { AvuImportStatusBadge } from '@/features/imports/components/AvuImportStatusBadge'
import { AVU_IMPORT_CATEGORIES, AVU_IMPORT_SUBCATEGORIES, type AvuImportCategoria } from '@/features/imports/taxonomy'
import type { ExtractedFields } from '@/features/imports/types'

interface FormState {
  numeroAvu: string
  dataCriacao: string
  gerenciaResponsavel: string
  dataLimite: string
  emitenteNome: string
  projeto: string
  local: string
  latitude: string
  longitude: string
  descricao: string
}

const EMPTY_FORM: FormState = {
  numeroAvu: '',
  dataCriacao: '',
  gerenciaResponsavel: '',
  dataLimite: '',
  emitenteNome: '',
  projeto: '',
  local: '',
  latitude: '',
  longitude: '',
  descricao: '',
}

export function ImportReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { show } = useToast()

  const importQuery = useQuery({ queryKey: ['avu-imports', id], queryFn: () => getImport(id!), enabled: !!id })
  const logsQuery = useQuery({ queryKey: ['avu-imports', id, 'logs'], queryFn: () => listImportLogs(id!), enabled: !!id })
  const pdfUrlQuery = useQuery({
    queryKey: ['avu-imports', id, 'pdf-url'],
    queryFn: () => getStagingPdfUrl(importQuery.data!.stagingPath),
    enabled: Boolean(importQuery.data) && !importQuery.data?.avuId,
  })
  const imageUrlsQuery = useQuery({
    queryKey: ['avu-imports', id, 'image-urls', importQuery.data?.stagingImagePaths],
    queryFn: () => getStagingImageUrls(importQuery.data!.stagingImagePaths),
    enabled: Boolean(importQuery.data) && !importQuery.data?.avuId && (importQuery.data?.stagingImagePaths.length ?? 0) > 0,
  })

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [categoria, setCategoria] = useState<AvuImportCategoria>('OUTROS')
  const [subcategoria, setSubcategoria] = useState('Outros')
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    const fields = importQuery.data?.extractedFields
    if (!fields) return
    setForm({
      numeroAvu: fields.numeroAvu ?? '',
      dataCriacao: fields.dataCriacao ?? '',
      gerenciaResponsavel: fields.gerenciaResponsavel ?? '',
      dataLimite: fields.dataLimite ?? '',
      emitenteNome: fields.emitenteNome ?? '',
      projeto: fields.projeto ?? '',
      local: fields.local ?? '',
      latitude: fields.latitude?.toString() ?? '',
      longitude: fields.longitude?.toString() ?? '',
      descricao: fields.descricao ?? '',
    })
    // categoria_sugerida/subcategoria_sugerida são colunas de texto livre (não um enum no banco) —
    // um provedor de IA real (ou dado legado) pode devolver algo fora da taxonomia conhecida, então
    // valida antes de usar como chave de AVU_IMPORT_SUBCATEGORIES (senão o .map() abaixo quebra a página).
    const sugerida = importQuery.data?.categoriaSugerida
    const categoriaValida = (AVU_IMPORT_CATEGORIES as readonly string[]).includes(sugerida ?? '')
      ? (sugerida as AvuImportCategoria)
      : 'OUTROS'
    setCategoria(categoriaValida)

    const subcategoriaSugerida = importQuery.data?.subcategoriaSugerida
    const subcategoriasValidas = AVU_IMPORT_SUBCATEGORIES[categoriaValida]
    setSubcategoria(
      subcategoriaSugerida && subcategoriasValidas.includes(subcategoriaSugerida)
        ? subcategoriaSugerida
        : subcategoriasValidas[0],
    )
  }, [importQuery.data])

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Importação inválida')
      const fields: ExtractedFields = {
        numeroAvu: form.numeroAvu || null,
        dataCriacao: form.dataCriacao || null,
        gerenciaResponsavel: form.gerenciaResponsavel || null,
        dataLimite: form.dataLimite || null,
        emitenteNome: form.emitenteNome || null,
        // `emitenteId` nunca é editado nesta tela (não é mais um Select) — só
        // passa adiante o que a Edge Function já tentou resolver sozinha
        // (nome extraído batendo com exatamente um perfil cadastrado). O
        // vínculo "oficial" com um usuário do sistema continua existindo
        // quando bate; quando não bate, emitenteNome (texto livre) preserva
        // o valor real do PDF de qualquer forma.
        emitenteId: importQuery.data?.extractedFields?.emitenteId ?? null,
        projeto: form.projeto || null,
        local: form.local || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        descricao: form.descricao,
        missingFields: [],
      }
      return confirmImport(id, fields, categoria, subcategoria)
    },
    onSuccess: (avuId) => {
      show({ tone: 'success', title: 'AVU criada', description: 'A importação foi confirmada com sucesso.' })
      navigate(`${ROUTES.avus}/${avuId}`)
    },
    onError: (error) => show({ tone: 'error', title: 'Falha ao confirmar', description: String(error) }),
  })

  if (importQuery.isLoading) return <LoadingState />
  if (!importQuery.data) return <EmptyState title="Importação não encontrada" />

  const avuImport = importQuery.data
  const canEdit = avuImport.status === 'REVISAO_NECESSARIA'
  const canSubmit = canEdit && form.descricao.trim().length > 0 && !confirmMutation.isPending

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={avuImport.originalFileName}
        description="Revisão da importação de PDF."
        actions={<AvuImportStatusBadge status={avuImport.status} />}
      />

      {avuImport.status === 'ERRO' && (
        <Card className="border-magenta-200 bg-magenta-50">
          <CardContent>
            <p className="text-sm font-medium text-magenta-700">Falha no processamento</p>
            <p className="mt-1 text-sm text-magenta-600">{avuImport.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {avuImport.avuId && (
        <Card className="border-secondary-200 bg-secondary-50">
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-secondary-700">Esta importação já criou uma AVU.</p>
            <Button size="sm" onClick={() => navigate(`${ROUTES.avus}/${avuImport.avuId}`)}>
              <ExternalLink className="size-4" />
              Ver AVU
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>PDF original</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pdfUrlQuery.data ? (
              <iframe title="PDF original" src={pdfUrlQuery.data} className="h-[32rem] w-full" />
            ) : avuImport.avuId ? (
              <div className="p-5 text-sm text-gray-500">PDF disponível na aba "Documentos" da AVU criada.</div>
            ) : (
              <LoadingState label="Carregando PDF..." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados extraídos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Confiança da classificação</span>
              <span
                className={cn(
                  'text-sm font-semibold',
                  (avuImport.confianca ?? 0) >= 80 ? 'text-secondary-600' : 'text-gold-600',
                )}
              >
                {avuImport.confianca !== null ? `${avuImport.confianca}%` : '—'}
              </span>
            </div>

            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {avuImport.imageCount} imagem(ns) encontrada(s)
              </span>
              {avuImport.imageCount > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {(imageUrlsQuery.data ?? []).map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-gray-200">
                      <img src={url} alt={`Imagem extraída ${index + 1}`} className="aspect-square w-full object-cover" />
                    </a>
                  ))}
                  {imageUrlsQuery.isLoading && (
                    <div className="col-span-full text-sm text-gray-400">Carregando miniaturas...</div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Número AVU"
                value={form.numeroAvu}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, numeroAvu: event.target.value }))}
              />
              <Input
                label="Data de criação"
                type="date"
                value={form.dataCriacao}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, dataCriacao: event.target.value }))}
              />
              <Input
                label="Gerência responsável"
                value={form.gerenciaResponsavel}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, gerenciaResponsavel: event.target.value }))}
              />
              <Input
                label="Data limite"
                type="date"
                value={form.dataLimite}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, dataLimite: event.target.value }))}
              />
              <Input
                label="Emitente"
                value={form.emitenteNome}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, emitenteNome: event.target.value }))}
              />
              <Input
                label="Projeto"
                value={form.projeto}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, projeto: event.target.value }))}
              />
              <Input
                label="Local"
                value={form.local}
                disabled={!canEdit}
                onChange={(event) => setForm((f) => ({ ...f, local: event.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Latitude"
                  value={form.latitude}
                  disabled={!canEdit}
                  onChange={(event) => setForm((f) => ({ ...f, latitude: event.target.value }))}
                />
                <Input
                  label="Longitude"
                  value={form.longitude}
                  disabled={!canEdit}
                  onChange={(event) => setForm((f) => ({ ...f, longitude: event.target.value }))}
                />
              </div>
            </div>

            <Textarea
              label="Descrição"
              rows={4}
              value={form.descricao}
              disabled={!canEdit}
              onChange={(event) => setForm((f) => ({ ...f, descricao: event.target.value }))}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="Categoria"
                options={AVU_IMPORT_CATEGORIES.map((c) => ({ value: c, label: c }))}
                value={categoria}
                disabled={!canEdit}
                onChange={(event) => {
                  const next = event.target.value as AvuImportCategoria
                  setCategoria(next)
                  setSubcategoria(AVU_IMPORT_SUBCATEGORIES[next][0])
                }}
              />
              <Select
                label="Subcategoria"
                options={AVU_IMPORT_SUBCATEGORIES[categoria].map((s) => ({ value: s, label: s }))}
                value={subcategoria}
                disabled={!canEdit}
                onChange={(event) => setSubcategoria(event.target.value)}
              />
            </div>

            {canEdit && (
              <Button disabled={!canSubmit} isLoading={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                Confirmar e criar AVU
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-graphite-700"
        >
          Log de processamento
          <ChevronDown className={cn('size-4 transition-transform', showLogs && 'rotate-180')} />
        </button>
        {showLogs && (
          <CardContent className="border-t border-gray-100 pt-4">
            <ul className="flex flex-col gap-2">
              {(logsQuery.data ?? []).map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      entry.status === 'ERRO' ? 'bg-magenta-500' : entry.status === 'SUCESSO' ? 'bg-secondary-500' : 'bg-gray-400',
                    )}
                  />
                  <div>
                    <p className="font-medium text-graphite-700">{entry.step}</p>
                    {entry.message && <p className="text-gray-500">{entry.message}</p>}
                  </div>
                </li>
              ))}
              {(logsQuery.data ?? []).length === 0 && <p className="text-sm text-gray-400">Nenhum log ainda.</p>}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
