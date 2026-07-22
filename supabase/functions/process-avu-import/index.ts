// Edge Function: process-avu-import
//
// Roda o pipeline PDF → OCR → Extração de texto → Extração de campos →
// Extração de imagens → Classificação IA → Validação → Criação do AVU.
// É a única peça deste projeto que pode segurar chaves de IA com segurança
// (nunca no frontend) — ver docs/architecture.md e o README desta pasta.
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
import { extractPdfText, extractPdfImages, type ExtractedImage } from './lib/pdf.ts'
import { getAIProvider } from './lib/aiProviders.ts'
import type { ClassificationResult } from './lib/classify.ts'

const STAGING_BUCKET = 'avu-import-staging'
const ATTACHMENTS_BUCKET = 'avu-attachments'
const CONFIDENCE_THRESHOLD = 80

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

interface AvuImportRow {
  id: string
  staging_path: string
  original_file_name: string
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
    .select('id, staging_path, original_file_name')
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

    // OCR + Extração de texto (uma só chamada — texto nativo, PDF não escaneado).
    let rawText: string
    try {
      rawText = await extractPdfText(pdfBytes)
    } catch (error) {
      await log(supabase, importId, 'OCR', 'ERRO', String(error))
      throw new Error('Não foi possível ler o texto do PDF — pode estar corrompido ou ser uma imagem escaneada')
    }
    await log(supabase, importId, 'OCR', 'SUCESSO', `${rawText.length} caracteres extraídos`)
    await log(supabase, importId, 'EXTRACAO_TEXTO', 'SUCESSO', null)

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

    // Extração de imagens (melhor esforço — nunca derruba o pipeline)
    const { images, warnings: imageWarnings } = await extractPdfImages(pdfBytes)
    await log(
      supabase,
      importId,
      'EXTRACAO_IMAGENS',
      'SUCESSO',
      imageWarnings.length > 0 ? imageWarnings.join(' | ') : `${images.length} imagem(ns) extraída(s)`,
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

    await copyStagingToAttachments(supabase, importRow, avuId as string, images)
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

  const { data: fileData } = await supabase.storage.from(STAGING_BUCKET).download(importRow.staging_path)
  const images = fileData ? (await extractPdfImages(new Uint8Array(await fileData.arrayBuffer()))).images : []

  await copyStagingToAttachments(supabase, importRow, avuId as string, images)

  return avuId as string
}

async function resolveEmitenteId(supabase: SupabaseClient, emitenteNome: string | null): Promise<string | null> {
  if (!emitenteNome) return null
  const { data } = await supabase.from('profiles').select('id').ilike('full_name', emitenteNome.trim())
  return data && data.length === 1 ? data[0].id : null
}

async function classify(descricao: ExtractedFields['descricao']): Promise<ClassificationResult> {
  if (!descricao) return { categoria: 'OUTROS', subcategoria: 'Geral', confianca: 0 }
  const provider = getAIProvider()
  return provider.classify(descricao)
}

async function copyStagingToAttachments(
  supabase: SupabaseClient,
  importRow: AvuImportRow,
  avuId: string,
  images: ExtractedImage[],
): Promise<void> {
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

  for (const image of images) {
    const fileName = `imagem-${image.index + 1}.jpg`
    const imagePath = `${avuId}/${crypto.randomUUID()}-${fileName}`
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(imagePath, image.bytes, { contentType: image.mimeType })

    if (!uploadError) {
      await supabase.from('avu_attachments').insert({
        avu_id: avuId,
        kind: 'photo',
        file_path: imagePath,
        file_name: fileName,
        mime_type: image.mimeType,
        size_bytes: image.bytes.byteLength,
        uploaded_by: uploadedBy,
      })
    }
  }

  await supabase.storage.from(STAGING_BUCKET).remove([importRow.staging_path])
}
