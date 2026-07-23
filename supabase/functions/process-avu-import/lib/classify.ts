// Classificador heurístico por palavra-chave — provider padrão do AIProvider
// (ver aiProviders.ts) quando nenhuma chave de IA real está configurada.
// Puro (sem `Deno.*`) para ser testável via Vitest a partir do frontend.

import { AVU_IMPORT_CATEGORIES, type AvuImportCategoria } from './subcategories.ts'

export interface ClassificationResult {
  categoria: AvuImportCategoria
  subcategoria: string
  confianca: number
}

interface SubcategoryRule {
  nome: string
  keywords: string[]
}

interface CategoryRule {
  categoria: AvuImportCategoria
  subcategorias: SubcategoryRule[]
}

// Um classificador por palavra-chave não deveria alegar alta confiança — o
// teto abaixo do limiar de validação (80%, ver index.ts) é deliberado: sem
// um provedor de IA real configurado, a maioria dos casos cai honestamente
// em REVISAO_NECESSARIA, que é o comportamento correto, não um bug.
const HEURISTIC_MAX_CONFIDENCE = 68
const HEURISTIC_BASE_CONFIDENCE = 40
const HEURISTIC_CONFIDENCE_PER_HIT = 12
const FALLBACK_CONFIDENCE = 30

const RULES: CategoryRule[] = [
  {
    categoria: 'ÁREAS VERDES',
    subcategorias: [
      { nome: 'Roço', keywords: ['roço', 'roçagem', 'roçada', 'roçar'] },
      { nome: 'Capina', keywords: ['capina', 'capinação', 'capinar'] },
      { nome: 'Poda', keywords: ['poda', 'podar', 'galho'] },
      { nome: 'Árvores', keywords: ['árvore', 'arvore', 'árvores', 'arvores', 'tronco'] },
      { nome: 'Supressão Vegetal', keywords: ['supressão vegetal', 'supressao vegetal', 'remoção de árvore', 'remocao de arvore'] },
      { nome: 'Mato', keywords: ['mato', 'matagal'] },
      { nome: 'Vegetação', keywords: ['vegetação', 'vegetacao', 'vegetação alta', 'vegetacao alta'] },
      { nome: 'Outros', keywords: ['jardim', 'grama', 'gramado', 'canteiro', 'muda'] },
    ],
  },
  {
    categoria: 'MANUTENÇÃO',
    subcategorias: [
      { nome: 'Muros', keywords: ['muro', 'muros', 'alvenaria'] },
      { nome: 'Cercas', keywords: ['cerca', 'cercas', 'cercamento', 'alambrado'] },
      { nome: 'Concertina', keywords: ['concertina', 'arame farpado'] },
      { nome: 'Portões', keywords: ['portão', 'portao', 'portões', 'portoes', 'cancela'] },
      { nome: 'Outros', keywords: ['manutenção', 'manutencao', 'reparo', 'estrutura', 'estrutural'] },
    ],
  },
  {
    categoria: 'ILUMINAÇÃO',
    subcategorias: [
      { nome: 'Poste', keywords: ['poste'] },
      { nome: 'Luminária', keywords: ['luminária', 'luminaria', 'lâmpada', 'lampada'] },
      { nome: 'Refletor', keywords: ['refletor', 'holofote'] },
      { nome: 'Fotocélula', keywords: ['fotocélula', 'fotocelula', 'relé fotoelétrico', 'rele fotoeletrico'] },
      { nome: 'Cabo', keywords: ['cabo de energia', 'cabo elétrico', 'cabo eletrico', 'fiação', 'fiacao'] },
      { nome: 'Outros', keywords: ['iluminação', 'iluminacao'] },
    ],
  },
]

export function classifyDescricao(descricao: string): ClassificationResult {
  const text = descricao.toLowerCase()
  let best: { categoria: AvuImportCategoria; subcategoria: string; hits: number } | null = null

  for (const rule of RULES) {
    for (const sub of rule.subcategorias) {
      const hits = sub.keywords.filter((keyword) => text.includes(keyword)).length
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { categoria: rule.categoria, subcategoria: sub.nome, hits }
      }
    }
  }

  if (!best) {
    return { categoria: 'OUTROS', subcategoria: 'Outros', confianca: FALLBACK_CONFIDENCE }
  }

  const confianca = Math.min(HEURISTIC_MAX_CONFIDENCE, HEURISTIC_BASE_CONFIDENCE + best.hits * HEURISTIC_CONFIDENCE_PER_HIT)
  return { categoria: best.categoria, subcategoria: best.subcategoria, confianca }
}

// Reexportado só para quem importar classify.ts não precisar de um segundo import.
export { AVU_IMPORT_CATEGORIES }
