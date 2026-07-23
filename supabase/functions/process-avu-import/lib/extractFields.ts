// Extração de campos do texto de um PDF de AVU no "modelo padronizado".
// Puro (sem `Deno.*`) para ser testável via Vitest a partir do frontend.
//
// Reescrito depois de validar contra um PDF real (ver docs/testing.md) — a
// versão anterior assumia "Rótulo: valor" numa única linha de texto, o que
// nunca é como o modelo real é impresso. A estrutura real (confirmada linha
// por linha extraindo um PDF de produção de verdade) é:
//
//   Gerência Responsável pelo tratamento
//   GER FACILITIES SAO LUIZ EFC - RAFAEL PEREIRA OLIVEIRA
//
// ou seja: o RÓTULO ocupa uma linha (às vezes duas, ver "Data Limite de" +
// "Resolução" abaixo) inteira, sem dois-pontos, e o VALOR vem na(s) linha(s)
// seguinte(s) — nunca na mesma linha. Rótulo/valor na mesma linha (o que o
// código antigo assumia) não aparece em lugar nenhum do documento real.
//
// Duas armadilhas reais encontradas e evitadas aqui:
// - "Gerência" (sozinho, valor "GALNR") e "Gerência Responsável pelo
//   tratamento" (valor com o nome da gerência) são DOIS campos distintos no
//   mesmo documento — usar comparação de linha inteira (não prefixo) evita
//   confundir um com o outro.
// - "Emitentes" (plural, no documento real) não é "Emitente" — um match por
//   prefixo (usado antes) capturava só a letra "s" sobrando como valor.
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
  // Cada rótulo é uma ou mais linhas (uma string com '\n' quando o rótulo
  // real quebra em mais de uma linha, ex. "Data Limite de\nResolução").
  labels: string[]
}

const SINGLE_LINE_FIELDS: FieldSpec[] = [
  { key: 'dataCriacao', labels: ['Criada em', 'Data de Criação', 'Data de Criacao', 'Data Criação', 'Data Criacao'] },
  {
    key: 'gerenciaResponsavel',
    labels: ['Gerência Responsável pelo tratamento', 'Gerência Responsável pelo Tratamento', 'Gerência Responsável', 'Gerencia Responsavel'],
  },
  { key: 'dataLimite', labels: ['Data Limite de\nResolução', 'Data Limite de Resolução', 'Data Limite', 'Prazo'] },
  { key: 'emitenteNome', labels: ['Emitentes', 'Emitente'] },
  { key: 'projeto', labels: ['Projeto'] },
  { key: 'local', labels: ['Local'] },
]

const LATITUDE_LABELS = ['Latitude']
const LONGITUDE_LABELS = ['Longitude']
const DESCRICAO_LABELS = ['Descrição', 'Descricao']

// Todo rótulo conhecido do modelo real (incluindo os que não são um dos 10
// campos extraídos) — usado só para saber onde o bloco de Descrição termina,
// já que a Descrição não tem um marcador de fim próprio, só "a próxima linha
// que é claramente outro rótulo". Calibrado contra o PDF real (ver
// docs/testing.md); o primeiro item é o observado de fato logo após a
// Descrição no documento de teste.
const DESCRICAO_STOP_LABELS = [
  'Põe em risco a integridade física de alguém',
  'Pode haver impacto direto na operação e/ou',
  'Está impedindo o trabalho de alguém?',
  'A situação pode piorar nos próximos dias?',
  'Complexidade de tratamento',
  'Tipificação',
  'Utilização de tecnologia?',
  'Providências adotadas',
  'Recomendação de Segurança',
  'Ações',
  'Memória de Cálculo',
  'Anexos',
  ...SINGLE_LINE_FIELDS.flatMap((f) => f.labels),
  ...LATITUDE_LABELS,
  ...LONGITUDE_LABELS,
]

const AVU_NUMERO_PATTERN = /\bAVU[0-9A-Z]{4,}\b/i

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ').toLowerCase()
}

function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Testa se `label` (uma ou mais linhas) começa exatamente em `lines[startIndex]`. Retorna quantas linhas o rótulo consumiu, ou 0 se não bateu. */
function matchLabelAt(lines: string[], startIndex: number, label: string): number {
  const labelLines = label.split('\n').map(normalizeLine)
  for (let offset = 0; offset < labelLines.length; offset += 1) {
    const line = lines[startIndex + offset]
    if (line === undefined || normalizeLine(line) !== labelLines[offset]) return 0
  }
  return labelLines.length
}

/** Procura o primeiro rótulo (entre variantes) em todo o documento; devolve o índice da linha de VALOR (logo após o rótulo) ou null. */
function findValueLineIndex(lines: string[], labels: string[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    for (const label of labels) {
      const consumed = matchLabelAt(lines, i, label)
      if (consumed > 0) return i + consumed
    }
  }
  return null
}

function parseDateToIso(raw: string | null): string | null {
  if (!raw) return null
  // Datas reais vêm às vezes com hora junto ("17/04/2026 08:40" — "Criada
  // em") — o campo que nos interessa é só a data, então corta qualquer coisa
  // depois do padrão de data reconhecido em vez de exigir a string inteira.
  const trimmed = raw.trim()

  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
  if (isoMatch) return isoMatch[1]

  const brMatch = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(trimmed)
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

function extractNumeroAvu(text: string): string | null {
  const match = AVU_NUMERO_PATTERN.exec(text)
  return match ? match[0].toUpperCase() : null
}

function extractDescricao(lines: string[]): string | null {
  const valueStart = findValueLineIndex(lines, DESCRICAO_LABELS)
  if (valueStart === null) return null

  let stopIndex = lines.length
  for (let i = valueStart; i < lines.length; i += 1) {
    const isStopLabel = DESCRICAO_STOP_LABELS.some((label) => matchLabelAt(lines, i, label) > 0)
    if (isStopLabel) {
      stopIndex = i
      break
    }
  }

  const value = lines.slice(valueStart, stopIndex).join('\n').trim()
  return value.length > 0 ? value : null
}

export function extractAvuFields(rawText: string): ExtractedFields {
  const lines = toLines(rawText)

  const values: Record<SingleLineKey, string | null> = {
    numeroAvu: extractNumeroAvu(rawText),
    dataCriacao: null,
    gerenciaResponsavel: null,
    dataLimite: null,
    emitenteNome: null,
    projeto: null,
    local: null,
  }

  for (const spec of SINGLE_LINE_FIELDS) {
    const valueIndex = findValueLineIndex(lines, spec.labels)
    values[spec.key] = valueIndex !== null ? (lines[valueIndex] ?? null) : null
  }

  const latitudeIndex = findValueLineIndex(lines, LATITUDE_LABELS)
  const longitudeIndex = findValueLineIndex(lines, LONGITUDE_LABELS)
  const latitude = parseNumber(latitudeIndex !== null ? lines[latitudeIndex] : null)
  const longitude = parseNumber(longitudeIndex !== null ? lines[longitudeIndex] : null)
  const descricao = extractDescricao(lines)
  const dataCriacao = parseDateToIso(values.dataCriacao)
  const dataLimite = parseDateToIso(values.dataLimite)

  // Todos os 10 campos pedidos contam como "faltando" quando não encontrados
  // — a importação não deve ser tratada como completa se qualquer um deles
  // não foi identificado (ver requisito de validação em docs/testing.md).
  const missingFields: string[] = []
  if (!values.numeroAvu) missingFields.push('numeroAvu')
  if (!dataCriacao) missingFields.push('dataCriacao')
  if (!values.gerenciaResponsavel) missingFields.push('gerenciaResponsavel')
  if (!dataLimite) missingFields.push('dataLimite')
  if (!values.emitenteNome) missingFields.push('emitenteNome')
  if (!values.projeto) missingFields.push('projeto')
  if (!values.local) missingFields.push('local')
  if (latitude === null) missingFields.push('latitude')
  if (longitude === null) missingFields.push('longitude')
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
