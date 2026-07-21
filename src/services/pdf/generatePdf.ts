import type { PdfDocumentDefinition } from './types'

/**
 * Contrato estável para geração de PDF. A implementação real será escolhida
 * na sprint de Relatórios entre:
 *  - `@react-pdf/renderer` no cliente (laudos simples, sem dependência de servidor)
 *  - função Edge do Supabase com Puppeteer (layouts complexos/paginação avançada)
 * Ver docs/architecture.md para o comparativo.
 */
export async function generatePdf(_definition: PdfDocumentDefinition): Promise<Blob> {
  throw new Error('generatePdf ainda não implementado — ver docs/architecture.md (seção PDF).')
}
