// Abstração de provedor de IA — o sistema nunca fica acoplado a um único
// provedor. `HeuristicAIProvider` (classify.ts) é o padrão, sempre
// disponível, sem chamada externa. `OpenAIProvider` só é escolhido pela
// factory se o secret `OPENAI_API_KEY` estiver configurado no Edge Function
// (nunca no frontend — `supabase secrets set OPENAI_API_KEY=...`).
//
// Próximo provider a implementar (mesma interface, não implementado
// especulativamente): Azure OpenAI (`AzureOpenAIProvider`, gated por
// `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_API_KEY`) e um modelo corporativo
// interno, quando/se existir um endpoint definido.

import { classifyDescricao, type ClassificationResult } from './classify.ts'
import { AVU_IMPORT_CATEGORIES, AVU_IMPORT_SUBCATEGORIES } from './subcategories.ts'

export interface AIProvider {
  readonly name: string
  classify(descricao: string): Promise<ClassificationResult>
}

export class HeuristicAIProvider implements AIProvider {
  readonly name = 'heuristic'

  // deno-lint-ignore require-await
  async classify(descricao: string): Promise<ClassificationResult> {
    return classifyDescricao(descricao)
  }
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai'

  constructor(private readonly apiKey: string) {}

  async classify(descricao: string): Promise<ClassificationResult> {
    const prompt =
      `Classifique a descrição de uma vulnerabilidade (AVU) em uma das categorias: ${AVU_IMPORT_CATEGORIES.join(', ')}.\n` +
      `Para cada categoria, as subcategorias válidas são:\n${Object.entries(AVU_IMPORT_SUBCATEGORIES)
        .map(([categoria, subs]) => `- ${categoria}: ${subs.join(', ')}`)
        .join('\n')}\n\n` +
      `Descrição: "${descricao}"\n\n` +
      'Responda APENAS com um JSON no formato {"categoria": "...", "subcategoria": "...", "confianca": 0-100}.'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`)
    }

    const body = await response.json()
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('Resposta da OpenAI sem conteúdo')

    const parsed = JSON.parse(content) as { categoria?: string; subcategoria?: string; confianca?: number }
    if (!parsed.categoria || !parsed.subcategoria || typeof parsed.confianca !== 'number') {
      throw new Error('Resposta da OpenAI em formato inesperado')
    }

    // A resposta de um LLM é texto livre, não um enum garantido — se vier fora da taxonomia
    // conhecida (paráfrase, acentuação diferente, etc.), cai pra OUTROS/Geral em vez de propagar
    // um valor que quebraria a tela de revisão (o Select de categoria/subcategoria assume um
    // dos valores fixos de `subcategories.ts`).
    const categoria = (AVU_IMPORT_CATEGORIES as readonly string[]).includes(parsed.categoria)
      ? (parsed.categoria as ClassificationResult['categoria'])
      : 'OUTROS'
    const subcategoriasValidas = AVU_IMPORT_SUBCATEGORIES[categoria]
    const subcategoria = subcategoriasValidas.includes(parsed.subcategoria) ? parsed.subcategoria : subcategoriasValidas[0]

    return { categoria, subcategoria, confianca: parsed.confianca }
  }
}

export function getAIProvider(): AIProvider {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  if (openAiKey) return new OpenAIProvider(openAiKey)

  // Sem chave configurada: cai graciosamente no classificador heurístico —
  // o pipeline continua funcionando, só com confiança mais conservadora.
  return new HeuristicAIProvider()
}
