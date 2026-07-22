// Extração de texto e imagens embutidas de um PDF nativo digital (com camada
// de texto — confirmado como o formato do "modelo padronizado" desta sprint,
// não escaneado/fotografado).
//
// IMPORTANTE — melhor esforço, não validado contra um PDF real: não há uma
// amostra do template desta sprint. `extractPdfText` usa a API documentada
// da biblioteca `unpdf` (compatível com Deno via especificador `npm:`) e tem
// confiança razoável de funcionar como está. `extractPdfImages` é mais
// arriscado: PDFs guardam imagens embutidas tanto já codificadas (JPEG,
// comum em fotos digitalizadas — o caso que este código cobre) quanto como
// bitmap bruto sem compressão (não coberto aqui, exigiria escrever um
// encoder PNG do zero) — imagens nesse segundo formato são puladas com um
// aviso em vez de quebrar o pipeline inteiro. Valide/ajuste assim que um PDF
// real estiver disponível (ver docs/testing.md, "Limitações conhecidas").

// @deno-types="npm:unpdf"
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0'

export interface ExtractedImage {
  index: number
  bytes: Uint8Array
  mimeType: string
}

export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const document = await getDocumentProxy(pdfBytes)
  const { text } = await extractText(document, { mergePages: true })
  return typeof text === 'string' ? text : (text as string[]).join('\n')
}

/**
 * Best-effort: só extrai imagens já codificadas como JPEG (o formato mais
 * comum para fotos embutidas). Bitmaps brutos são ignorados com um aviso.
 * Nunca lança — qualquer falha aqui não deve derrubar o resto do pipeline.
 */
export async function extractPdfImages(pdfBytes: Uint8Array): Promise<{ images: ExtractedImage[]; warnings: string[] }> {
  const warnings: string[] = []
  const images: ExtractedImage[] = []

  try {
    const document = await getDocumentProxy(pdfBytes)
    let imageIndex = 0

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const operatorList = await page.getOperatorList()
      const imageOps = operatorList.fnArray
        .map((fn: number, i: number) => ({ fn, i }))
        .filter(({ fn }: { fn: number }) => fn === (page.OPS?.paintImageXObject ?? -1))

      for (const { i } of imageOps) {
        const name = operatorList.argsArray[i]?.[0]
        if (!name) continue

        try {
          const imageObj = await new Promise<{ data: Uint8Array; kind?: number } | null>((resolve) => {
            page.objs.get(name, (result: unknown) => resolve(result as { data: Uint8Array; kind?: number } | null))
          })

          if (!imageObj?.data) continue

          // `kind` 3 (RGB_24BPP)/1 (GRAYSCALE) em pdf.js indicam bitmap bruto,
          // não um JPEG já codificado — sem encoder PNG disponível, pulamos.
          const looksLikeEncodedJpeg = imageObj.data[0] === 0xff && imageObj.data[1] === 0xd8
          if (!looksLikeEncodedJpeg) {
            warnings.push(`Imagem ${imageIndex + 1} da página ${pageNumber} é um bitmap bruto — extração não suportada, pulada.`)
            imageIndex += 1
            continue
          }

          images.push({ index: imageIndex, bytes: imageObj.data, mimeType: 'image/jpeg' })
          imageIndex += 1
        } catch (error) {
          warnings.push(`Falha ao extrair imagem da página ${pageNumber}: ${String(error)}`)
        }
      }
    }
  } catch (error) {
    warnings.push(`Falha ao abrir o PDF para extração de imagens: ${String(error)}`)
  }

  return { images, warnings }
}
