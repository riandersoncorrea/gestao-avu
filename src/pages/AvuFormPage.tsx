import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { useToast } from '@/components/Toast'
import { createAvu, getAvuById, updateAvu } from '@/features/avus/avuService'
import { AvuForm, avuToFormValues } from '@/features/avus/components/AvuForm'
import type { AvuFormValues } from '@/features/avus/types'
import { ROUTES } from '@/lib/routes'

export function AvuFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { show } = useToast()
  const isEditing = Boolean(id)

  const avuQuery = useQuery({
    queryKey: ['avus', id],
    queryFn: () => getAvuById(id!),
    enabled: isEditing,
  })

  async function handleSubmit(values: AvuFormValues) {
    try {
      const avu = isEditing ? await updateAvu(id!, values) : await createAvu(values)
      show({ tone: 'success', title: isEditing ? 'AVU atualizada' : 'AVU criada', description: avu.numeroAvu })
      navigate(`${ROUTES.avus}/${avu.id}`)
    } catch (error) {
      show({ tone: 'error', title: 'Erro ao salvar AVU', description: String(error) })
    }
  }

  if (isEditing && avuQuery.isLoading) return <LoadingState />
  if (isEditing && !avuQuery.data) {
    return <PageHeader title="AVU não encontrada" description="Verifique se o link está correto." />
  }

  return (
    <div>
      <PageHeader
        title={isEditing ? `Editar ${avuQuery.data?.numeroAvu}` : 'Nova AVU'}
        description="Preencha os dados da Análise de Vulnerabilidade."
      />
      <AvuForm
        defaultValues={avuQuery.data ? avuToFormValues(avuQuery.data) : undefined}
        onSubmit={handleSubmit}
        submitLabel={isEditing ? 'Salvar alterações' : 'Criar AVU'}
      />
    </div>
  )
}
