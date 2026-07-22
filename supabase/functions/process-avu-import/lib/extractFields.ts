// Extração de campos do texto puro de um PDF de AVU no "modelo padronizado".
// Puro (sem `Deno.*`) para ser testável via Vitest a partir do frontend.
//
// Os rótulos abaixo são uma calibração de melhor esforço — não há uma amostra
// real do PDF disponível nesta sprint. Ajuste os arrays `labels` de cada
// campo assim que um PDF real estiver disponível (ver docs/testing.md).

export interface ExtractedFields {
  numeroAvu: string | null
  dataCriacao: string | null // ISO 'YYYY-MM-DD'
  gerenciaResponsavel: string | null
  dataLimite: string | null // ISO 'YYYY-MM-DD'
  emitenteNome: string | null
  projeto: string | null
  local: string | null
  latitude: number | null
  longitude: number | null
  descricao: string | null
  missingFields: string[]
}

type SingleLineKey = Exclude<keyof ExtractedFields, 'missingFields' | 'latitude' | 'longitude' | 'descricao'>

interface FieldSpec {
  key: SingleLineKey
  labels: string[]
  required: boolean
}

const SINGLE_LINE_FIELDS: FieldSpec[] = [
  { key: 'numeroAvu', labels: ['Número AVU', 'Numero AVU', 'Nº AVU', 'N° AVU'], required: false },
  { key: 'dataCriacao', labels: ['Data de Criação', 'Data de Criacao', 'Data Criação', 'Data Criacao'], required: true },
  {
    key: 'gerenciaResponsavel',
    labels: ['Gerência Responsável', 'Gerencia Responsavel', 'Gerência', 'Gerencia'],
    required: false,
  },
  { key: 'dataLimite', labels: ['Data Limite', 'Data Limite/Prazo', 'Prazo'], required: false },
  { key: 'emitenteNome', labels: ['Emitente'], required: false },
  { key: 'projeto', labels: ['Projeto'], required: false },
  { key: 'local', labels: ['Local'], required: false },
]

const LATITUDE_LABELS = ['Latitude']
const LONGITUDE_LABELS = ['Longitude']
const DESCRICAO_LABELS = ['Descrição', 'Descricao']

// Todos os rótulos conhecidos (usado pra saber onde o bloco de Descrição termina).
const ALL_LABELS = [
  ...SINGLE_LINE_FIELDS.flatMap((f) => f.labels),
  ...LATITUDE_LABELS,
  ...LONGITUDE_LABELS,
  ...DESCRICAO_LABELS,
]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSingleLineValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const regex = new RegExp(`^[ \\t]*${escapeRegex(label)}[ \\t]*[:-]?[ \\t]*(.+)$`, 'im')
    const match = regex.exec(text)
    if (match?.[1]) {
      const value = match[1].trim()
      if (value.length > 0) return value
    }
  }
  return null
}

function parseDateToIso(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()

  // Já em ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // Formato brasileiro DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(trimmed)
  if (brMatch) {
    const [, day, month, year] = brMatch
    return `${year}-${month}-${day}`
  }

  return null
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null
  const normalized = raw.trim().replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : null
}

function extractDescricao(text: string): string | null {
  for (const label of DESCRICAO_LABELS) {
    const startRegex = new RegExp(`^[ \\t]*${escapeRegex(label)}[ \\t]*[:-]?[ \\t]*(.*)$`, 'im')
    const startMatch = startRegex.exec(text)
    if (!startMatch) continue

    const afterLabelIndex = startMatch.index + startMatch[0].length
    const firstLineValue = startMatch[1]?.trim() ?? ''
    const rest = text.slice(afterLabelIndex)

    const otherLabels = ALL_LABELS.filter((l) => l !== label)
    let endIndex = rest.length
    for (const other of otherLabels) {
      const otherRegex = new RegExp(`^[ \\t]*${escapeRegex(other)}[ \\t]*[:-]`, 'im')
      const otherMatch = otherRegex.exec(rest)
      if (otherMatch && otherMatch.index < endIndex) endIndex = otherMatch.index
    }

    const restValue = rest.slice(0, endIndex).trim()
    const full = [firstLineValue, restValue].filter(Boolean).join('\n').trim()
    if (full.length > 0) return full
  }
  return null
}

export function extractAvuFields(rawText: string): ExtractedFields {
  const values: Record<SingleLineKey, string | null> = {
    numeroAvu: null,
    dataCriacao: null,
    gerenciaResponsavel: null,
    dataLimite: null,
    emitenteNome: null,
    projeto: null,
    local: null,
  }

  for (const spec of SINGLE_LINE_FIELDS) {
    values[spec.key] = extractSingleLineValue(rawText, spec.labels)
  }

  const latitude = parseNumber(extractSingleLineValue(rawText, LATITUDE_LABELS))
  const longitude = parseNumber(extractSingleLineValue(rawText, LONGITUDE_LABELS))
  const descricao = extractDescricao(rawText)
  const dataCriacao = parseDateToIso(values.dataCriacao)
  const dataLimite = parseDateToIso(values.dataLimite)

  const missingFields: string[] = []
  for (const spec of SINGLE_LINE_FIELDS) {
    if (!spec.required) continue
    // Campo de data: "faltando" significa não encontrado OU não parseável,
    // não só "rótulo ausente" — uma data em formato não reconhecido também
    // deve cair em REVISAO_NECESSARIA, não passar como se estivesse ok.
    const parsedValue = spec.key === 'dataCriacao' ? dataCriacao : spec.key === 'dataLimite' ? dataLimite : values[spec.key]
    if (!parsedValue) missingFields.push(spec.key)
  }
  if (!descricao) missingFields.push('descricao')

  return {
    numeroAvu: values.numeroAvu,
    dataCriacao,
    gerenciaResponsavel: values.gerenciaResponsavel,
    dataLimite,
    emitenteNome: values.emitenteNome,
    projeto: values.projeto,
    local: values.local,
    latitude,
    longitude,
    descricao,
    missingFields,
  }
}
