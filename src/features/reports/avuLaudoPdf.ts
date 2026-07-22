import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { getAvuLaudoData } from './avuLaudoService'
import { AvuLaudoDocument } from './AvuLaudoDocument'

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Busca os dados da AVU e gera/baixa o laudo em PDF (número/descrição/fotos antes-depois/datas/responsável/OM/nota/conclusão). */
export async function downloadAvuLaudoPdf(avuId: string): Promise<void> {
  const data = await getAvuLaudoData(avuId)
  // `AvuLaudoDocument` renderiza um <Document> na raiz, mas seu próprio tipo de props não é
  // `DocumentProps` — cast necessário só pro TS aceitar (comportamento em runtime não muda).
  const element = createElement(AvuLaudoDocument, { data }) as unknown as ReactElement<DocumentProps>
  const blob = await pdf(element).toBlob()
  triggerDownload(blob, `${data.numeroAvu}-laudo.pdf`)
}
