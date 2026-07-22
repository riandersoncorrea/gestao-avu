import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { Card, CardContent } from '@/components/Card'
import { listProfileOptions } from '@/services/profileService'
import { listDistinctValues } from '@/features/avus/avuService'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import { AVU_STATUSES } from '@/features/avus/types'
import { EMPTY_DASHBOARD_FILTERS, type DashboardFilters } from '../types'

export interface DashboardFiltersBarProps {
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
}

function useDistinct(column: Parameters<typeof listDistinctValues>[0]) {
  return useQuery({ queryKey: ['avus', 'distinct', column], queryFn: () => listDistinctValues(column) })
}

export function DashboardFiltersBar({ filters, onChange }: DashboardFiltersBarProps) {
  const categorias = useDistinct('categoria')
  const gerencias = useDistinct('gerencia_responsavel')
  const projetos = useDistinct('projeto')
  const locais = useDistinct('local')
  const empresas = useDistinct('empresa_executante')
  const profilesQuery = useQuery({ queryKey: ['profiles', 'options'], queryFn: listProfileOptions })

  function set<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const toOptions = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: value }))
  const profileOptions = (profilesQuery.data ?? []).map((p) => ({ value: p.id, label: p.fullName }))

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_DASHBOARD_FILTERS)

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex gap-2 lg:col-span-2">
            {/* `label` visível em vez de só `aria-label`: em navegadores móveis (Safari iOS),
                um <input type="date"> vazio não mostra nenhuma dica de formato como no
                desktop — sem um rótulo visível, o campo aparece em branco e sem contexto. */}
            <Input
              type="date"
              label="Período — início"
              value={filters.periodoInicio}
              onChange={(event) => set('periodoInicio', event.target.value)}
            />
            <Input
              type="date"
              label="Período — fim"
              value={filters.periodoFim}
              onChange={(event) => set('periodoFim', event.target.value)}
            />
          </div>
          <Select
            placeholder="Status"
            value={filters.status}
            onChange={(event) => set('status', event.target.value as DashboardFilters['status'])}
            options={AVU_STATUSES.map((status) => ({ value: status, label: avuStatusLabel(status) }))}
          />
          <Select
            placeholder="Gerência"
            value={filters.gerenciaResponsavel}
            onChange={(event) => set('gerenciaResponsavel', event.target.value)}
            options={toOptions(gerencias.data)}
          />
          <Select
            placeholder="Categoria"
            value={filters.categoria}
            onChange={(event) => set('categoria', event.target.value)}
            options={toOptions(categorias.data)}
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
            options={profileOptions}
          />
          <Select
            placeholder="Emitente"
            value={filters.emitenteId}
            onChange={(event) => set('emitenteId', event.target.value)}
            options={profileOptions}
          />
        </div>

        {hasActiveFilters && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_DASHBOARD_FILTERS)}>
              <X className="size-4" />
              Limpar filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
