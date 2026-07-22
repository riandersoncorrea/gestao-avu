/** Rótulos legíveis dos campos de `avus` que `audit_avus_change()` (migration 0010) monitora. */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  descricao: 'Descrição',
  categoria: 'Categoria',
  subcategoria: 'Subcategoria',
  local: 'Local',
  projeto: 'Projeto',
  gerencia_responsavel: 'Gerência responsável',
  empresa_executante: 'Empresa executante',
  data_limite: 'Data limite',
  emitente: 'Emitente',
  responsavel: 'Responsável',
  fiscal: 'Fiscal',
  prioridade: 'Prioridade',
  nota_sap: 'Nota SAP',
  ordem_manutencao: 'Ordem de manutenção',
  latitude: 'Latitude',
  longitude: 'Longitude',
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export interface DescribedChanges {
  label: string
  comment: string | null
}

/**
 * `metadata.changes` de um evento `avu.updated` (só os campos que de fato mudaram, com
 * `{ from, to }`) vira um rótulo curto ("Descrição alterada" / "3 campos alterados") e um
 * comentário multi-linha "Campo: de → para" para exibição na timeline/página de auditoria.
 */
export function describeAuditChanges(metadata: Record<string, unknown> | null): DescribedChanges {
  const changes = metadata?.changes as Record<string, { from: unknown; to: unknown }> | undefined
  const fields = changes ? Object.keys(changes) : []

  if (fields.length === 0) {
    return { label: 'Dados atualizados', comment: null }
  }

  const label =
    fields.length === 1 ? `${AUDIT_FIELD_LABELS[fields[0]] ?? fields[0]} alterado(a)` : `${fields.length} campos alterados`

  const comment = fields
    .map((field) => `${AUDIT_FIELD_LABELS[field] ?? field}: ${formatValue(changes![field].from)} → ${formatValue(changes![field].to)}`)
    .join('\n')

  return { label, comment }
}
