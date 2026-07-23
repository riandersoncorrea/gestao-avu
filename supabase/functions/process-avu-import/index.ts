// Edge Function: process-avu-import
//
// Roda o pipeline PDF → extração de texto (com fallback de OCR) → extração
// de campos → extração de imagens → classificação IA → validação → criação
// do AVU. É a única peça deste projeto que pode segurar chaves de IA/OCR com
// segurança (nunca no frontend) — ver docs/architecture.md e o README desta
// pasta.
//
// Modos (`action` no corpo da requisição):
//  - omitido/'process': roda o pipeline completo pra uma importação em
//    AGUARDANDO (chamado pelo frontend logo após o upload).
//  - 'confirm': pula direto pra criação da AVU com os campos (possivelmente
//    editados) que vieram da tela de revisão — usado quando a validação
//    automática pede REVISAO_NECESSARIA e um humano confirma.
//
// Autenticação: usa o JWT de quem chamou (forwardado automaticamente por
// `supabase.functions.invoke`) pra criar um client "como se fosse" aquele
// usuário — toda leitura/escrita já respeita a RLS normal (mesma disciplina
// das RPCs: nunca confiar só em quem conseguiu invocar). Não usa a
// service-role key — não é necessária, quem tem `avus.create` já enxerga
// tudo que este pipeline precisa.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { extractAvuFields, type ExtractedFields } from './lib/extractFields.ts'
import { extractPdfContent, type ExtractedImage } from './lib/pdf.ts'
import { getOcrProvider } from './lib/ocr.ts'
import { getAIProvider } from './lib/aiProviders.ts'
import type { ClassificationResult } from './lib/classify.ts'

const STAGING_BUCKET = 'avu-import-staging'
const ATTACHMENTS_BUCKET = 'avu-attachments'
const CONFIDENCE_THRESHOLD = 80
// Abaixo deste tanto de caracteres extraídos, tratamos o PDF como "sem texto
// digital suficiente" (provavelmente escaneado/fotografado) e acionamos OCR
// em vez de seguir com um texto vazio/quase vazio — o modelo padrão real
// (validado, ver docs/testing.md) tem mais de 2000 caracteres de texto
// nativo, então uma margem de 100 é folgada o bastante pra não disparar OCR
// à toa num PDF digital válido, mas curto.
const MIN_DIGITAL_TEXT_LENGTH = 100

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

interface AvuImportRow {
  id: string
  staging_path: string
  original_file_name: string
  staging_image_paths: string[]
}

interface ProcessRequestBody {
  importId: string
  action?: undefined
}

interface ConfirmRequestBody {
  importId: string
  action: 'confirm'
  fields: Record<string, unknown>
  categoria: string
  subcategoria: string
}

type RequestBody = ProcessRequestBody | ConfirmRequestBody

function isConfirmBody(body: RequestBody): body is ConfirmRequestBody {
  return (body as ConfirmRequestBody).action === 'confirm'
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400)
  }

  try {
    if (isConfirmBody(body)) {
      const avuId = await confirmImport(supabase, body)
      return jsonResponse({ avuId }, 200)
    }

    await processImport(supabase, body.importId)
    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: String(error) }, 500)
  }
})

async function log(
  supabase: SupabaseClient,
  importId: string,
  step: string,
  status: 'INICIADO' | 'SUCESSO' | 'ERRO',
  message: string | null,
  metadata?: unknown,
) {
  await supabase
    .from('avu_import_logs')
    .insert({ import_id: importId, step, status, message, metadata: metadata ?? null })
}

async function getAuthUserId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Usuário não autenticado')
  return data.user.id
}

async function fetchImportRow(supabase: SupabaseClient, importId: string): Promise<AvuImportRow> {
  const { data, error } = await supabase
    .from('avu_imports')
    .select('id, staging_path, original_file_name, staging_image_paths')
    .eq('id', importId)
    .single()

  if (error || !data) throw new Error('Importação não encontrada ou sem permissão')
  return data
}

async function processImport(supabase: SupabaseClient, importId: string): Promise<void> {
  const importRow = await fetchImportRow(supabase, importId)

  await supabase.from('avu_imports').update({ status: 'PROCESSANDO' }).eq('id', importId)

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STAGING_BUCKET)
      .download(importRow.staging_path)
    if (downloadError || !fileData) {
      throw new Error(`Falha ao baixar PDF do staging: ${downloadError?.message ?? 'arquivo não encontrado'}`)
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer())

    // Extração de texto + imagens (uma única abertura do PDF — ver
    // pdf.ts sobre por que abrir duas vezes quebra).
    let rawText: string
    let images: Awaited<ReturnType<typeof extractPdfContent>>['images']
    try {
      const content = await extractPdfContent(pdfBytes)
      rawText = content.text
      images = content.images
      if (content.imageWarnings.length > 0) {
        await log(supabase, importId, 'EXTRACAO_IMAGENS', 'SUCESSO', content.imageWarnings.join(' | '))
      }
    } catch (error) {
      await log(supabase, importId, 'EXTRACAO_TEXTO', 'ERRO', String(error))
      throw new Error('Não foi possível ler o PDF — pode estar corrompido')
    }

    // Estratégia de texto: tenta o texto digital primeiro; só recorre a OCR
    // se o PDF não tiver texto digital suficiente (provavelmente
    // escaneado/fotografado) — nunca gasta OCR à toa num PDF que já tem
    // texto nativo (ver MIN_DIGITAL_TEXT_LENGTH).
    if (rawText.trim().length < MIN_DIGITAL_TEXT_LENGTH) {
      await log(
        supabase,
        importId,
        'EXTRACAO_TEXTO',
        'SUCESSO',
        `Apenas ${rawText.trim().length} caractere(s) de texto digital — abaixo do mínimo, tentando OCR`,
      )
      await log(supabase, importId, 'OCR', 'INICIADO', 'PDF sem texto digital suficiente — acionando OCR')
      try {
        const ocrText = await getOcrProvider().recognize(pdfBytes)
        await log(supabase, importId, 'OCR', 'SUCESSO', `${ocrText.length} caractere(s) reconhecidos via OCR`)
        rawText = ocrText
      } catch (error) {
        await log(supabase, importId, 'OCR', 'ERRO', String(error))
        throw new Error(String(error))
      }
    } else {
      await log(supabase, importId, 'EXTRACAO_TEXTO', 'SUCESSO', `${rawText.length} caracteres extraídos do texto digital do PDF`)
    }

    // Extração de campos
    const fields = extractAvuFields(rawText)
    await log(
      supabase,
      importId,
      'EXTRACAO_CAMPOS',
      fields.missingFields.length > 0 ? 'ERRO' : 'SUCESSO',
      fields.missingFields.length > 0 ? `Campos não encontrados: ${fields.missingFields.join(', ')}` : null,
      { fields },
    )

    const emitenteId = await resolveEmitenteId(supabase, fields.emitenteNome)

    // Sobe as imagens extraídas pro bucket de staging já nesta passada
    // (mesmo antes de saber se vai automático ou pra revisão humana) — é o
    // que permite a tela de revisão mostrar miniaturas/contagem antes da
    // confirmação, sem precisar reabrir o PDF depois.
    const { stagingImagePaths, uploadWarnings } = await stageExtractedImages(supabase, importId, images)
    await log(
      supabase,
      importId,
      'EXTRACAO_IMAGENS',
      uploadWarnings.length > 0 ? 'ERRO' : 'SUCESSO',
      `${stagingImagePaths.length} de ${images.length} imagem(ns) extraída(s) enviada(s) para o staging` +
        (uploadWarnings.length > 0 ? ` | ${uploadWarnings.join(' | ')}` : ''),
    )

    // Classificação IA
    const classification = await classify(fields.descricao)
    await log(
      supabase,
      importId,
      'CLASSIFICACAO_IA',
      'SUCESSO',
      `${classification.categoria}/${classification.subcategoria} (${classification.confianca}%)`,
    )

    const extractedFieldsPayload = { ...fields, emitenteId }

    await supabase
      .from('avu_imports')
      .update({
        extracted_fields: extractedFieldsPayload,
        categoria_sugerida: classification.categoria,
        subcategoria_sugerida: classification.subcategoria,
        confianca: classification.confianca,
        staging_image_paths: stagingImagePaths,
        image_count: stagingImagePaths.length,
      })
      .eq('id', importId)

    // Validação
    const isValid = fields.missingFields.length === 0 && classification.confianca >= CONFIDENCE_THRESHOLD
    await log(
      supabase,
      importId,
      'VALIDACAO',
      isValid ? 'SUCESSO' : 'ERRO',
      isValid
        ? null
        : `Confiança ${classification.confianca}% (mínimo ${CONFIDENCE_THRESHOLD}%) ou campos obrigatórios faltando`,
    )

    if (!isValid) {
      await supabase.from('avu_imports').update({ status: 'REVISAO_NECESSARIA' }).eq('id', importId)
      return
    }

    // Criação do AVU (caminho automático — confiança suficiente)
    const { data: avuId, error: rpcError } = await supabase.rpc('avu_import_confirm_create_avu', {
      p_import_id: importId,
      p_fields: extractedFieldsPayload,
      p_categoria: classification.categoria,
      p_subcategoria: classification.subcategoria,
    })
    if (rpcError) throw new Error(rpcError.message)

    await copyStagingToAttachments(supabase, { ...importRow, staging_image_paths: stagingImagePaths }, avuId as string)
  } catch (error) {
    await supabase.from('avu_imports').update({ status: 'ERRO', error_message: String(error) }).eq('id', importId)
    throw error
  }
}

async function confirmImport(supabase: SupabaseClient, body: ConfirmRequestBody): Promise<string> {
  const importRow = await fetchImportRow(supabase, body.importId)

  const { data: avuId, error: rpcError } = await supabase.rpc('avu_import_confirm_create_avu', {
    p_import_id: body.importId,
    p_fields: body.fields,
    p_categoria: body.categoria,
    p_subcategoria: body.subcategoria,
  })
  if (rpcError) throw new Error(rpcError.message)

  // As imagens já foram extraídas e enviadas pro staging durante
  // `processImport` (é assim que a tela de revisão mostrou as miniaturas) —
  // não precisa reabrir/reprocessar o PDF aqui.
  await copyStagingToAttachments(supabase, importRow, avuId as string)

  return avuId as string
}

async function resolveEmitenteId(supabase: SupabaseClient, emitenteNome: string | null): Promise<string | null> {
  if (!emitenteNome) return null
  const { data } = await supabase.from('profiles').select('id').ilike('full_name', emitenteNome.trim())
  return data && data.length === 1 ? data[0].id : null
}

async function classify(descricao: ExtractedFields['descricao']): Promise<ClassificationResult> {
  if (!descricao) return { categoria: 'OUTROS', subcategoria: 'Outros', confianca: 0 }
  const provider = getAIProvider()
  return provider.classify(descricao)
}

/** Sobe cada imagem extraída pro bucket de staging (mesmo bucket do PDF original) e devolve os paths. */
async function stageExtractedImages(
  supabase: SupabaseClient,
  importId: string,
  images: ExtractedImage[],
): Promise<{ stagingImagePaths: string[]; uploadWarnings: string[] }> {
  const stagingImagePaths: string[] = []
  const uploadWarnings: string[] = []

  for (const image of images) {
    const extension = image.mimeType === 'image/png' ? 'png' : 'jpg'
    const path = `${importId}/imagem-${image.index + 1}.${extension}`
    const { error } = await supabase.storage.from(STAGING_BUCKET).upload(path, image.bytes, {
      contentType: image.mimeType,
      upsert: true,
    })
    if (error) {
      uploadWarnings.push(`Falha ao enviar imagem ${image.index + 1} para o staging: ${error.message}`)
    } else {
      stagingImagePaths.push(path)
    }
  }

  return { stagingImagePaths, uploadWarnings }
}

async function copyStagingToAttachments(supabase: SupabaseClient, importRow: AvuImportRow, avuId: string): Promise<void> {
  const uploadedBy = await getAuthUserId(supabase)

  const { data: pdfData } = await supabase.storage.from(STAGING_BUCKET).download(importRow.staging_path)
  if (pdfData) {
    const pdfPath = `${avuId}/${crypto.randomUUID()}-${importRow.original_file_name}`
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(pdfPath, pdfData, { contentType: 'application/pdf' })

    if (!uploadError) {
      await supabase.from('avu_attachments').insert({
        avu_id: avuId,
        kind: 'document',
        file_path: pdfPath,
        file_name: importRow.original_file_name,
        mime_type: 'application/pdf',
        size_bytes: pdfData.size,
        uploaded_by: uploadedBy,
      })
    }
  }

  for (const stagingImagePath of importRow.staging_image_paths ?? []) {
    const { data: imageData } = await supabase.storage.from(STAGING_BUCKET).download(stagingImagePath)
    if (!imageData) continue

    const fileName = stagingImagePath.split('/').pop() ?? stagingImagePath
    const imagePath = `${avuId}/${crypto.randomUUID()}-${fileName}`
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(imagePath, imageData, { contentType: imageData.type || 'image/png' })

    if (!uploadError) {
      await supabase.from('avu_attachments').insert({
        avu_id: avuId,
        kind: 'photo',
        file_path: imagePath,
        file_name: fileName,
        mime_type: imageData.type || 'image/png',
        size_bytes: imageData.size,
        uploaded_by: uploadedBy,
      })
    }

    await supabase.storage.from(STAGING_BUCKET).remove([stagingImagePath])
  }

  await supabase.storage.from(STAGING_BUCKET).remove([importRow.staging_path])
}
