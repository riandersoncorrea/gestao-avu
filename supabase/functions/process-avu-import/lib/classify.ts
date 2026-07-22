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
      { nome: 'Poda', keywords: ['poda', 'podar', 'galho'] },
      { nome: 'Jardinagem', keywords: ['jardim', 'grama', 'gramado', 'canteiro', 'muda'] },
      { nome: 'Remoção de árvore', keywords: ['remoção de árvore', 'remocao de arvore', 'árvore caída', 'arvore caida'] },
      { nome: 'Outros', keywords: ['árvore', 'arvore', 'vegetação', 'vegetacao'] },
    ],
  },
  {
    categoria: 'MANUTENÇÃO',
    subcategorias: [
      { nome: 'Estrutural', keywords: ['estrutura', 'estrutural', 'trinca', 'rachadura', 'corrosão', 'corrosao'] },
      { nome: 'Hidráulica', keywords: ['vazamento', 'hidráulica', 'hidraulica', 'tubulação', 'tubulacao', 'entupimento'] },
      { nome: 'Elétrica', keywords: ['elétrica', 'eletrica', 'fiação', 'fiacao', 'curto-circuito', 'quadro elétrico', 'quadro eletrico'] },
      { nome: 'Civil', keywords: ['piso', 'parede', 'concreto', 'alvenaria', 'pintura'] },
      { nome: 'Outros', keywords: ['manutenção', 'manutencao', 'reparo'] },
    ],
  },
  {
    categoria: 'ILUMINAÇÃO',
    subcategorias: [
      { nome: 'Poste', keywords: ['poste'] },
      { nome: 'Refletor', keywords: ['refletor', 'holofote'] },
      { nome: 'Rede elétrica', keywords: ['rede elétrica de iluminação', 'rede eletrica de iluminacao', 'cabo de energia'] },
      { nome: 'Outros', keywords: ['lâmpada', 'lampada', 'iluminação', 'iluminacao', 'luminária', 'luminaria'] },
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
    return { categoria: 'OUTROS', subcategoria: 'Geral', confianca: FALLBACK_CONFIDENCE }
  }

  const confianca = Math.min(HEURISTIC_MAX_CONFIDENCE, HEURISTIC_BASE_CONFIDENCE + best.hits * HEURISTIC_CONFIDENCE_PER_HIT)
  return { categoria: best.categoria, subcategoria: best.subcategoria, confianca }
}

// Reexportado só para quem importar classify.ts não precisar de um segundo import.
export { AVU_IMPORT_CATEGORIES }
