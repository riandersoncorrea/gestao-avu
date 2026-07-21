import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Input } from '@/components/Input'
import { Textarea } from '@/components/Textarea'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { listProfileOptions } from '@/services/profileService'
import { listDistinctValues } from '../avuService'
import { priorityLabel } from './PriorityBadge'
import { AVU_PRIORITIES, type Avu, type AvuFormValues } from '../types'

const numberRangeMessage = 'Informe um número entre 0 e 100'

const avuFormSchema = z.object({
  gerenciaResponsavel: z.string(),
  dataLimite: z.string(),
  emitenteId: z.string(),
  projeto: z.string(),
  local: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  descricao: z.string().min(1, 'Descreva a AVU'),
  categoria: z.string(),
  subcategoria: z.string(),
  nivelConfiancaIa: z
    .string()
    .refine((value) => value.trim() === '' || (Number(value) >= 0 && Number(value) <= 100), {
      message: numberRangeMessage,
    }),
  responsavelId: z.string(),
  empresaExecutante: z.string(),
  fiscalId: z.string(),
  notaSap: z.string(),
  ordemManutencao: z.string(),
  prioridade: z.enum(AVU_PRIORITIES),
})

export const EMPTY_AVU_FORM_VALUES: AvuFormValues = {
  gerenciaResponsavel: '',
  dataLimite: '',
  emitenteId: '',
  projeto: '',
  local: '',
  latitude: '',
  longitude: '',
  descricao: '',
  categoria: '',
  subcategoria: '',
  nivelConfiancaIa: '',
  responsavelId: '',
  empresaExecutante: '',
  fiscalId: '',
  notaSap: '',
  ordemManutencao: '',
  prioridade: 'MEDIA',
}

export function avuToFormValues(avu: Avu): AvuFormValues {
  return {
    gerenciaResponsavel: avu.gerenciaResponsavel ?? '',
    dataLimite: avu.dataLimite ?? '',
    emitenteId: avu.emitente?.id ?? '',
    projeto: avu.projeto ?? '',
    local: avu.local ?? '',
    latitude: avu.latitude?.toString() ?? '',
    longitude: avu.longitude?.toString() ?? '',
    descricao: avu.descricao,
    categoria: avu.categoria ?? '',
    subcategoria: avu.subcategoria ?? '',
    nivelConfiancaIa: avu.nivelConfiancaIa?.toString() ?? '',
    responsavelId: avu.responsavel?.id ?? '',
    empresaExecutante: avu.empresaExecutante ?? '',
    fiscalId: avu.fiscal?.id ?? '',
    notaSap: avu.notaSap ?? '',
    ordemManutencao: avu.ordemManutencao ?? '',
    prioridade: avu.prioridade,
  }
}

export interface AvuFormProps {
  defaultValues?: AvuFormValues
  onSubmit: (values: AvuFormValues) => Promise<void>
  isSubmitting?: boolean
  submitLabel: string
}

export function AvuForm({ defaultValues = EMPTY_AVU_FORM_VALUES, onSubmit, isSubmitting, submitLabel }: AvuFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AvuFormValues>({ resolver: zodResolver(avuFormSchema), defaultValues })

  const profilesQuery = useQuery({ queryKey: ['profiles', 'options'], queryFn: listProfileOptions })
  const categoriasQuery = useQuery({
    queryKey: ['avus', 'distinct', 'categoria'],
    queryFn: () => listDistinctValues('categoria'),
  })
  const subcategoriasQuery = useQuery({
    queryKey: ['avus', 'distinct', 'subcategoria'],
    queryFn: () => listDistinctValues('subcategoria'),
  })

  const profileOptions = (profilesQuery.data ?? []).map((p) => ({ value: p.id, label: p.fullName }))

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values)
      })}
    >
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Textarea label="Descrição" error={errors.descricao?.message} {...register('descricao')} />
          </div>
          <div>
            <Input list="categoria-options" label="Categoria" {...register('categoria')} />
            <datalist id="categoria-options">
              {(categoriasQuery.data ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
          <div>
            <Input list="subcategoria-options" label="Subcategoria" {...register('subcategoria')} />
            <datalist id="subcategoria-options">
              {(subcategoriasQuery.data ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
          <Input label="Projeto" {...register('projeto')} />
          <Input
            label="Nível de confiança IA (%)"
            type="number"
            min={0}
            max={100}
            hint="Preenchido manualmente até a classificação automática existir."
            error={errors.nivelConfiancaIa?.message}
            {...register('nivelConfiancaIa')}
          />
          <Select
            label="Prioridade"
            options={AVU_PRIORITIES.map((value) => ({ value, label: priorityLabel(value) }))}
            {...register('prioridade')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Localização</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Local" {...register('local')} />
          <Input label="Gerência responsável" {...register('gerenciaResponsavel')} />
          <Input label="Latitude" type="number" step="any" {...register('latitude')} />
          <Input label="Longitude" type="number" step="any" {...register('longitude')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responsáveis e prazo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Data limite" type="date" {...register('dataLimite')} />
          <Select
            label="Emitente"
            placeholder="Selecione"
            options={profileOptions}
            {...register('emitenteId')}
          />
          <Select
            label="Responsável"
            placeholder="Selecione"
            options={profileOptions}
            {...register('responsavelId')}
          />
          <Select label="Fiscal" placeholder="Selecione" options={profileOptions} {...register('fiscalId')} />
          <Input label="Empresa executante" {...register('empresaExecutante')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integração SAP</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Nota SAP" {...register('notaSap')} />
          <Input label="Ordem de manutenção" {...register('ordemManutencao')} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
