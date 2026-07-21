import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { Card, CardContent } from '@/components/Card'
import { listProfileOptions } from '@/services/profileService'
import { listDistinctValues } from '../avuService'
import { avuStatusLabel } from './AvuStatusBadge'
import { AVU_STATUSES, EMPTY_AVU_FILTERS, type AvuFilters } from '../types'

export interface AvuFiltersBarProps {
  filters: AvuFilters
  onChange: (filters: AvuFilters) => void
}

function useDistinct(column: Parameters<typeof listDistinctValues>[0]) {
  return useQuery({ queryKey: ['avus', 'distinct', column], queryFn: () => listDistinctValues(column) })
}

export function AvuFiltersBar({ filters, onChange }: AvuFiltersBarProps) {
  const categorias = useDistinct('categoria')
  const gerencias = useDistinct('gerencia_responsavel')
  const projetos = useDistinct('projeto')
  const locais = useDistinct('local')
  const empresas = useDistinct('empresa_executante')
  const profilesQuery = useQuery({ queryKey: ['profiles', 'options'], queryFn: listProfileOptions })

  function set<K extends keyof AvuFilters>(key: K, value: AvuFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const toOptions = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: value }))

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_AVU_FILTERS)

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por número, descrição, local ou projeto..."
            value={filters.search}
            onChange={(event) => set('search', event.target.value)}
            className="pl-9"
            aria-label="Busca global"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            placeholder="Status"
            value={filters.status}
            onChange={(event) => set('status', event.target.value as AvuFilters['status'])}
            options={AVU_STATUSES.map((status) => ({ value: status, label: avuStatusLabel(status) }))}
          />
          <Select
            placeholder="Categoria"
            value={filters.categoria}
            onChange={(event) => set('categoria', event.target.value)}
            options={toOptions(categorias.data)}
          />
          <Select
            placeholder="Gerência"
            value={filters.gerenciaResponsavel}
            onChange={(event) => set('gerenciaResponsavel', event.target.value)}
            options={toOptions(gerencias.data)}
          />
          <Select
            placeholder="Projeto"
            value={filters.projeto}
            onChange={(event) => set('projeto', event.target.value)}
            options={toOptions(projetos.data)}
          />
          <Select
            placeholder="Local"
            value={filters.local}
            onChange={(event) => set('local', event.target.value)}
            options={toOptions(locais.data)}
          />
          <Select
            placeholder="Empresa"
            value={filters.empresaExecutante}
            onChange={(event) => set('empresaExecutante', event.target.value)}
            options={toOptions(empresas.data)}
          />
          <Select
            placeholder="Responsável"
            value={filters.responsavelId}
            onChange={(event) => set('responsavelId', event.target.value)}
            options={(profilesQuery.data ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
          />
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="Período — início"
              value={filters.periodoInicio}
              onChange={(event) => set('periodoInicio', event.target.value)}
            />
            <Input
              type="date"
              aria-label="Período — fim"
              value={filters.periodoFim}
              onChange={(event) => set('periodoFim', event.target.value)}
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_AVU_FILTERS)}>
              <X className="size-4" />
              Limpar filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
