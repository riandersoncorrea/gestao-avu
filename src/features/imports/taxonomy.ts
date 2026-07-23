/**
 * Taxonomia de categoria/subcategoria da classificação IA de importações.
 *
 * Duplicada intencionalmente de `supabase/functions/process-avu-import/lib/subcategories.ts`
 * (mesmo padrão já aceito no projeto para a matriz de permissões RBAC — ver
 * CLAUDE.md). Edge Functions (Deno) e o frontend (Vite) são runtimes/builds
 * separados, sem um jeito limpo de compartilhar este arquivo entre os dois.
 * Mantenha as duas listas sincronizadas se a taxonomia mudar.
 */
export const AVU_IMPORT_CATEGORIES = ['ÁREAS VERDES', 'MANUTENÇÃO', 'ILUMINAÇÃO', 'OUTROS'] as const

export type AvuImportCategoria = (typeof AVU_IMPORT_CATEGORIES)[number]

export const AVU_IMPORT_SUBCATEGORIES: Record<AvuImportCategoria, string[]> = {
  'ÁREAS VERDES': ['Roço', 'Capina', 'Poda', 'Árvores', 'Vegetação', 'Mato', 'Supressão Vegetal', 'Outros'],
  MANUTENÇÃO: ['Muros', 'Cercas', 'Concertina', 'Portões', 'Outros'],
  ILUMINAÇÃO: ['Poste', 'Luminária', 'Refletor', 'Fotocélula', 'Cabo', 'Outros'],
  OUTROS: ['Outros'],
}
