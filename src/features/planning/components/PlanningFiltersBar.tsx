import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { Card, CardContent } from '@/components/Card'
import { listProfileOptions } from '@/services/profileService'
import { listDistinctValues } from '@/features/avus/avuService'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import { priorityLabel } from '@/features/avus/components/PriorityBadge'
import { AVU_PRIORITIES, AVU_STATUSES } from '@/features/avus/types'
import { KANBAN_COLUMNS, KANBAN_COLUMN_LABELS } from '../kanbanColumn'
import { EMPTY_PLANNING_FILTERS, type PlanningFilters } from '../types'

const RISK_OPTIONS = [
  { value: 'baixo', label: 'Baixo' },
  { value: 'medio', label: 'Médio' },
  { value: 'alto', label: 'Alto' },
  { value: 'critico', label: 'Crítico' },
]

const SLA_OPTIONS = [
  { value: 'no_prazo', label: 'No prazo' },
  { value: 'proximo_vencimento', label: 'Próximo do vencimento' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'encerrado', label: 'Encerrado' },
]

export interface PlanningFiltersBarProps {
  filters: PlanningFilters
  onChange: (filters: PlanningFilters) => void
}

function useDistinct(column: Parameters<typeof listDistinctValues>[0]) {
  return useQuery({ queryKey: ['avus', 'distinct', column], queryFn: () => listDistinctValues(column) })
}

export function PlanningFiltersBar({ filters, onChange }: PlanningFiltersBarProps) {
  const categorias = useDistinct('categoria')
  const gerencias = useDistinct('gerencia_responsavel')
  const profilesQuery = useQuery({ queryKey: ['profiles', 'options'], queryFn: listProfileOptions })

  function set<K extends keyof PlanningFilters>(key: K, value: PlanningFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const toOptions = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: value }))
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_PLANNING_FILTERS)

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
            onChange={(event) => set('status', event.target.value as PlanningFilters['status'])}
            options={AVU_STATUSES.map((status) => ({ value: status, label: avuStatusLabel(status) }))}
          />
          <Select
            placeholder="Coluna do quadro"
            value={filters.coluna}
            onChange={(event) => set('coluna', event.target.value as PlanningFilters['coluna'])}
            options={KANBAN_COLUMNS.map((key) => ({ value: key, label: KANBAN_COLUMN_LABELS[key] }))}
          />
          <Select
            placeholder="Prioridade"
            value={filters.prioridade}
            onChange={(event) => set('prioridade', event.target.value as PlanningFilters['prioridade'])}
            options={AVU_PRIORITIES.map((value) => ({ value, label: priorityLabel(value) }))}
          />
          <Select
            placeholder="Risco"
            value={filters.risco}
            onChange={(event) => set('risco', event.target.value as PlanningFilters['risco'])}
            options={RISK_OPTIONS}
          />
          <Select
            placeholder="Prazo"
            value={filters.slaTone}
            onChange={(event) => set('slaTone', event.target.value as PlanningFilters['slaTone'])}
            options={SLA_OPTIONS}
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
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_PLANNING_FILTERS)}>
              <X className="size-4" />
              Limpar filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
