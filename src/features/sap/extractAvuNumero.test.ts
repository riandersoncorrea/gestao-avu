import { describe, expect, it } from 'vitest'
import { DEFAULT_AVU_REGEX_PATTERN, extractAvuNumero } from './extractAvuNumero'

describe('extractAvuNumero', () => {
  it('extrai o número do exemplo do pedido', () => {
    expect(extractAvuNumero('AVU2026004155 - Recuperação de Cerca')).toBe('AVU2026004155')
  })

  it('extrai mesmo com o número no meio da descrição', () => {
    expect(extractAvuNumero('Referente à AVU2026004155, recuperação de cerca patrimonial')).toBe('AVU2026004155')
  })

  it('é case-insensitive na busca mas normaliza o resultado para maiúsculas', () => {
    expect(extractAvuNumero('avu2026004155 - teste')).toBe('AVU2026004155')
  })

  it('retorna null quando a descrição não tem número de AVU', () => {
    expect(extractAvuNumero('Manutenção geral do pátio, sem referência')).toBeNull()
  })

  it('retorna null para descrição vazia/nula', () => {
    expect(extractAvuNumero('')).toBeNull()
    expect(extractAvuNumero(null)).toBeNull()
    expect(extractAvuNumero(undefined)).toBeNull()
  })

  it('aceita um padrão customizado', () => {
    expect(extractAvuNumero('Ticket: AVU-2026-0041 - Cerca', 'AVU-\\d{4}-\\d{4}')).toBe('AVU-2026-0041')
  })

  it('não derruba a extração se o padrão customizado for um regex inválido', () => {
    expect(extractAvuNumero('AVU2026004155 - Cerca', '[')).toBeNull()
  })

  it('o padrão default é exportado e usado quando nenhum é passado', () => {
    expect(DEFAULT_AVU_REGEX_PATTERN).toBe('AVU[0-9A-Z]+')
    expect(extractAvuNumero('AVU2026004155 - Cerca')).toBe(extractAvuNumero('AVU2026004155 - Cerca', DEFAULT_AVU_REGEX_PATTERN))
  })
})
