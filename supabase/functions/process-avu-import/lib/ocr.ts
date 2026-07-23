// Fallback de OCR — só é acionado quando o PDF não tem texto digital
// suficiente (ver `MIN_DIGITAL_TEXT_LENGTH` em index.ts): a estratégia padrão
// é sempre tentar o texto nativo do PDF primeiro (`pdf.ts`), nunca gastar OCR
// à toa num PDF que já tem camada de texto — o modelo padronizado de AVU
// confirmado (ver docs/testing.md) é gerado digitalmente (impressão de
// página web para PDF) e sempre tem texto nativo, então este caminho cobre
// o caso de alguém escanear/fotografar um formulário preenchido à mão.
//
// Mesmo padrão de abstração plugável por secret já usado em `aiProviders.ts`
// (`AIProvider`/`OPENAI_API_KEY`): nenhuma engine de OCR roda embutida na
// Edge Function (Tesseract via WASM exigiria rasterizar cada página com
// canvas, que não está disponível no runtime de Deno Edge/Deploy sem um
// binário nativo) — em vez disso, delega para uma API HTTP de OCR externa,
// gated por secret. Sem a secret configurada, falha com uma mensagem clara
// em vez de fingir que tentou.

export interface OcrProvider {
  readonly name: string
  recognize(pdfBytes: Uint8Array): Promise<string>
}

export class UnavailableOcrProvider implements OcrProvider {
  readonly name = 'unavailable'

  // deno-lint-ignore require-await
  async recognize(): Promise<string> {
    throw new Error(
      'PDF sem texto digital suficiente (provavelmente escaneado/fotografado) e nenhum provedor de OCR configurado. ' +
        'Configure o secret OCR_SPACE_API_KEY (supabase secrets set OCR_SPACE_API_KEY=...) para habilitar OCR, ou reenvie um PDF gerado digitalmente.',
    )
  }
}

interface OcrSpaceParsedResult {
  ParsedText?: string
}

interface OcrSpaceResponse {
  IsErroredOnProcessing?: boolean
  ErrorMessage?: string[] | string
  ParsedResults?: OcrSpaceParsedResult[]
}

/**
 * OCR.space (https://ocr.space/ocrapi) — aceita PDF diretamente (processa
 * página a página internamente, sem precisarmos rasterizar aqui), tem plano
 * gratuito com chave de API, e suporta português (`language=por`).
 */
export class OcrSpaceProvider implements OcrProvider {
  readonly name = 'ocrspace'

  constructor(private readonly apiKey: string) {}

  async recognize(pdfBytes: Uint8Array): Promise<string> {
    const form = new FormData()
    form.append('apikey', this.apiKey)
    form.append('language', 'por')
    form.append('isOverlayRequired', 'false')
    form.append('OCREngine', '2')
    form.append('filetype', 'PDF')
    // `new Uint8Array(pdfBytes)` (não só `pdfBytes`): força um `ArrayBuffer`
    // padrão no tipo, não o `ArrayBufferLike` genérico (que inclui
    // `SharedArrayBuffer`) que `Blob`/`BlobPart` não aceita.
    form.append('file', new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }), 'document.pdf')

    const response = await fetch('https://apipro1.ocr.space/parse/image', { method: 'POST', body: form })
    if (!response.ok) {
      throw new Error(`OCR.space respondeu ${response.status}: ${await response.text()}`)
    }

    const body = (await response.json()) as OcrSpaceResponse
    if (body.IsErroredOnProcessing) {
      const message = Array.isArray(body.ErrorMessage) ? body.ErrorMessage.join(', ') : (body.ErrorMessage ?? 'erro desconhecido')
      throw new Error(`OCR.space: ${message}`)
    }

    return (body.ParsedResults ?? [])
      .map((result) => result.ParsedText ?? '')
      .join('\n')
      .trim()
  }
}

export function getOcrProvider(): OcrProvider {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY')
  if (apiKey) return new OcrSpaceProvider(apiKey)
  return new UnavailableOcrProvider()
}
