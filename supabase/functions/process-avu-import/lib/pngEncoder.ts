// Encoder de PNG mínimo, sem dependência (nem npm nem nativa) — usa só
// `CompressionStream('deflate')`, uma Web API padrão disponível no Deno Edge
// Runtime, que já produz o formato zlib exigido pelo chunk IDAT do PNG.
//
// Por quê isto existe: `page.objs.get()` do pdf.js (via `unpdf`) entrega a
// imagem já DECODIFICADA como pixels crus (RGB/RGBA), não os bytes originais
// do stream (JPEG/PNG/o que for) — confirmado rodando contra um PDF real
// (ver docs/testing.md): as três fotos de "Anexos", comprimidas como JPEG no
// arquivo original (`pdfimages -list` confirma `enc=jpeg`), chegam aqui como
// `kind=RGB_24BPP` (pixels crus), não como bytes JPEG com os magic bytes
// 0xFFD8 esperados por uma versão anterior deste código. Ou seja, tentar
// detectar "já é JPEG" nesses bytes nunca funciona — a extração de imagem
// tem que sempre re-codificar o buffer de pixels decodificado, qualquer que
// tenha sido o formato original.

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff])
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(data, typeBytes.length)

  const out = new Uint8Array(4 + 4 + data.length + 4)
  out.set(u32be(data.length), 0)
  out.set(typeBytes, 4)
  out.set(data, 8)
  out.set(u32be(crc32(crcInput)), 8 + data.length)
  return out
}

async function deflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate')
  const writer = stream.writable.getWriter()
  // `new Uint8Array(data)`: força `ArrayBuffer` no tipo, não o `ArrayBufferLike`
  // genérico que `writer.write` (BufferSource) não aceita.
  void writer.write(new Uint8Array(data))
  void writer.close()

  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/**
 * Codifica um buffer de pixels crus (sem padding entre linhas) como PNG.
 * `channels` 3 = RGB (`kind` RGB_24BPP do pdf.js), 4 = RGBA (`kind` RGBA_32BPP).
 * Validado manualmente contra as 3 fotos reais de um PDF de AVU (ver
 * docs/testing.md) — abrir o PNG gerado mostra a foto correta, incluindo o
 * texto de geotag/timestamp sobreposto pela câmera.
 */
export async function encodeRawPixelsToPng(
  width: number,
  height: number,
  pixels: Uint8Array,
  channels: 3 | 4,
): Promise<Uint8Array> {
  const stride = width * channels
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    const srcStart = y * stride
    const dstStart = y * (stride + 1)
    raw[dstStart] = 0 // filter type: None
    raw.set(pixels.subarray(srcStart, srcStart + stride), dstStart + 1)
  }

  const compressed = await deflateZlib(raw)

  const ihdr = new Uint8Array(13)
  ihdr.set(u32be(width), 0)
  ihdr.set(u32be(height), 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = channels === 4 ? 6 : 2 // color type: 6 = RGBA, 2 = RGB
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const ihdrChunk = chunk('IHDR', ihdr)
  const idatChunk = chunk('IDAT', compressed)
  const iendChunk = chunk('IEND', new Uint8Array(0))

  const out = new Uint8Array(PNG_SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length)
  let offset = 0
  out.set(PNG_SIGNATURE, offset)
  offset += PNG_SIGNATURE.length
  out.set(ihdrChunk, offset)
  offset += ihdrChunk.length
  out.set(idatChunk, offset)
  offset += idatChunk.length
  out.set(iendChunk, offset)
  return out
}
