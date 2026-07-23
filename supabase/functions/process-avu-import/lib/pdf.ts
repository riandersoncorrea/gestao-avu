// Extração de texto e imagens embutidas de um PDF nativo digital (com camada
// de texto). Validado rodando este código de verdade, via Deno local, contra
// um PDF real submetido em produção (o único registro real em `avu_imports`
// até então falhava antes mesmo de chegar aqui — ver docs/testing.md,
// "Verificação manual da importação de PDF" para o relato completo).
//
// Três bugs confirmados nessa validação, todos corrigidos aqui:
//
// 1) `extractText(document, { mergePages: true })` (usado antes) devolve o
//    documento inteiro como uma ÚNICA linha — todas as quebras de linha
//    somem, viram espaço. Isso quebrava 100% da extração de campos (que
//    depende de rótulo numa linha e valor na linha seguinte — ver
//    extractFields.ts). Corrigido extraindo com `mergePages: false`
//    (preserva `\n` dentro de cada página) e juntando as páginas com `\n`.
// 2) `getDocumentProxy(pdfBytes)` transfere (detach) o `ArrayBuffer`
//    subjacente — chamar de novo com os mesmos bytes (como o código antigo
//    fazia: uma vez para texto, outra para imagens) lança
//    `DataCloneError: ArrayBuffer ... already detached`. Corrigido abrindo o
//    documento uma única vez e extraindo texto + imagens da mesma instância.
// 3) `page.OPS` (usado pelo filtro de operador de imagem) não existe no
//    objeto de página exposto pelo `unpdf` — é sempre `undefined`, então o
//    filtro nunca batia com nada, silenciosamente (zero imagens, zero
//    avisos). O enum `OPS` de verdade só é acessível via `resolvePDFJS()`.
//
// Um quarto ponto não era bem um "bug" mas uma suposição errada: a versão
// anterior assumia que `page.objs.get()` devolveria os bytes originais do
// stream da imagem (podendo checar o magic number de JPEG). Na prática o
// pdf.js sempre entrega a imagem já DECODIFICADA como pixels crus
// (RGB/RGBA), não importa o formato original — confirmado com as 3 fotos
// reais de "Anexos" (comprimidas como JPEG no arquivo, `pdfimages -list`
// confirma `enc=jpeg`) chegando aqui como `kind=RGB_24BPP`. Por isso a
// extração agora sempre re-codifica o buffer de pixels como PNG
// (`pngEncoder.ts`, sem dependência externa) em vez de tentar detectar um
// formato já codificado que nunca aparece nessa API.

// @deno-types="npm:unpdf"
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0'
import { resolvePDFJS } from 'npm:unpdf@0.11.0/pdfjs'
import { encodeRawPixelsToPng } from './pngEncoder.ts'

export interface ExtractedImage {
  index: number
  bytes: Uint8Array
  mimeType: string
}

export interface ExtractedPdfContent {
  text: string
  images: ExtractedImage[]
  imageWarnings: string[]
}

// pdf.js `ImageKind` — RGB_24BPP é o único formato que sabemos, com certeza,
// ser sempre uma foto real: JPEG (a fonte de toda foto de câmera embutida no
// modelo padrão) não suporta canal alfa, então nenhuma foto real chega aqui
// como RGBA_32BPP. Elementos decorativos exportados com transparência (ex.:
// o logo do cabeçalho do PDF real testado) chegam como RGBA_32BPP e são
// deliberadamente ignorados — não são "Anexos" da AVU.
const IMAGE_KIND_RGB_24BPP = 2

/**
 * Abre o PDF uma única vez e extrai texto (com quebras de linha preservadas)
 * e imagens embutidas na mesma passada — evita o bug de ArrayBuffer
 * detached de abrir o documento duas vezes com os mesmos bytes.
 */
export async function extractPdfContent(pdfBytes: Uint8Array): Promise<ExtractedPdfContent> {
  const document = await getDocumentProxy(pdfBytes)

  const { text } = await extractText(document, { mergePages: false })
  const pages = typeof text === 'string' ? [text] : text
  const joinedText = pages.join('\n')

  const { images, warnings } = await extractImagesFromDocument(document)

  return { text: joinedText, images, imageWarnings: warnings }
}

/**
 * Best-effort: re-codifica como PNG todo buffer de pixels RGB_24BPP
 * encontrado (a forma como o pdf.js sempre entrega fotos embutidas, JPEG ou
 * não — ver comentário no topo do arquivo). Imagens RGBA (com transparência,
 * tipicamente logos/elementos decorativos, não fotos de câmera) e bitmaps
 * em escala de cinza são pulados com aviso. Nunca lança — qualquer falha
 * aqui não deve derrubar o resto do pipeline.
 */
async function extractImagesFromDocument(
  // deno-lint-ignore no-explicit-any
  document: any,
): Promise<{ images: ExtractedImage[]; warnings: string[] }> {
  const warnings: string[] = []
  const images: ExtractedImage[] = []

  try {
    const pdfjs = (await resolvePDFJS()) as { OPS: { paintImageXObject: number } }
    const paintImageXObject = pdfjs.OPS.paintImageXObject
    let imageIndex = 0

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const operatorList = await page.getOperatorList()
      const imageOps = operatorList.fnArray
        .map((fn: number, i: number) => ({ fn, i }))
        .filter(({ fn }: { fn: number }) => fn === paintImageXObject)

      for (const { i } of imageOps) {
        const name = operatorList.argsArray[i]?.[0]
        if (!name) continue

        try {
          const imageObj = await new Promise<{ data: Uint8Array; width: number; height: number; kind?: number } | null>(
            (resolve) => {
              page.objs.get(name, (result: unknown) =>
                resolve(result as { data: Uint8Array; width: number; height: number; kind?: number } | null),
              )
            },
          )

          if (!imageObj?.data || !imageObj.width || !imageObj.height) continue

          if (imageObj.kind !== IMAGE_KIND_RGB_24BPP) {
            warnings.push(
              `Imagem ${imageIndex + 1} da página ${pageNumber} não é uma foto RGB (kind=${imageObj.kind}) — provavelmente um elemento decorativo (ex.: logo), não um anexo. Ignorada.`,
            )
            imageIndex += 1
            continue
          }

          const png = await encodeRawPixelsToPng(imageObj.width, imageObj.height, imageObj.data, 3)
          images.push({ index: imageIndex, bytes: png, mimeType: 'image/png' })
          imageIndex += 1
        } catch (error) {
          warnings.push(`Falha ao extrair imagem da página ${pageNumber}: ${String(error)}`)
        }
      }
    }
  } catch (error) {
    warnings.push(`Falha ao extrair imagens do PDF: ${String(error)}`)
  }

  return { images, warnings }
}
