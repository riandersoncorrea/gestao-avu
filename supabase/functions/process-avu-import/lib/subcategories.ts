// Taxonomia de categoria/subcategoria da classificação IA.
//
// Duplicada intencionalmente em `src/features/imports/taxonomy.ts` (mesmo
// padrão já aceito no projeto para a matriz de permissões RBAC — ver
// CLAUDE.md, "role_permissions... duplicada como um objeto plano em
// ProtectedRoute.test.tsx"): Edge Functions (Deno) e o frontend (Vite) são
// runtimes/builds separados, sem um jeito limpo de compartilhar este arquivo
// entre os dois. Mantenha as duas listas sincronizadas se a taxonomia mudar.

export const AVU_IMPORT_CATEGORIES = ['ÁREAS VERDES', 'MANUTENÇÃO', 'ILUMINAÇÃO', 'OUTROS'] as const

export type AvuImportCategoria = (typeof AVU_IMPORT_CATEGORIES)[number]

export const AVU_IMPORT_SUBCATEGORIES: Record<AvuImportCategoria, string[]> = {
  'ÁREAS VERDES': ['Roço', 'Capina', 'Poda', 'Árvores', 'Vegetação', 'Mato', 'Supressão Vegetal', 'Outros'],
  MANUTENÇÃO: ['Muros', 'Cercas', 'Concertina', 'Portões', 'Outros'],
  ILUMINAÇÃO: ['Poste', 'Luminária', 'Refletor', 'Fotocélula', 'Cabo', 'Outros'],
  OUTROS: ['Outros'],
}
