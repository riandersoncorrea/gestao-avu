/**
 * Extrai o número da AVU embutido na descrição de um registro SAP.
 *
 * Exemplo: "AVU2026004155 - Recuperação de Cerca" → "AVU2026004155".
 *
 * O padrão é configurável (input na página de importação) justamente porque
 * o formato usado pelo SAP pode não ser exatamente este — o padrão default
 * cobre o caso mais comum ("AVU" seguido de dígitos/letras).
 */
export const DEFAULT_AVU_REGEX_PATTERN = 'AVU[0-9A-Z]+'

export function extractAvuNumero(descricao: string | null | undefined, pattern: string = DEFAULT_AVU_REGEX_PATTERN): string | null {
  if (!descricao) return null

  let regex: RegExp
  try {
    regex = new RegExp(pattern, 'i')
  } catch {
    // Padrão inválido digitado pelo usuário — trata como "não encontrou", não derruba a importação.
    return null
  }

  const match = regex.exec(descricao)
  return match ? match[0].toUpperCase() : null
}
