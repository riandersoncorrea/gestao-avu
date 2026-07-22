import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { AvusReportDocument } from './AvusReportDocument'
import type { Avu } from '@/features/avus/types'

export async function downloadAvusReportPdf(avus: Avu[], filtersSummary: string): Promise<void> {
  // `AvusReportDocument` renderiza um <Document> na raiz, mas seu próprio tipo de props não é
  // `DocumentProps` — cast necessário só pro TS aceitar (comportamento em runtime não muda).
  const element = createElement(AvusReportDocument, { avus, filtersSummary }) as unknown as ReactElement<DocumentProps>
  const blob = await pdf(element).toBlob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `relatorio_avus_${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
