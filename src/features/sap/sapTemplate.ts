import ExcelJS from 'exceljs'
import { CANONICAL_HEADERS, REQUIRED_FIELDS, SAP_COLUMN_ORDER, type SapField } from './parsers/shared'

export const SAP_TEMPLATE_FILE_NAME = 'template_importacao_sap.xlsx'

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6357' } }
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
const DATE_FORMAT = 'dd/mm/yyyy'

/** Larguras por campo, calibradas pro conteúdo esperado de cada coluna (Descrição é a mais larga). */
const COLUMN_WIDTHS: Record<SapField, number> = {
  nota: 14,
  om: 14,
  statusSap: 16,
  centro: 12,
  dataPlanejada: 16,
  dataExecucao: 16,
  prioridadeSap: 14,
  descricao: 50,
}

interface ExampleRow {
  nota: string
  om: string
  statusSap: string
  centro: string
  dataPlanejada: string
  dataExecucao: string
  prioridadeSap: string
  descricao: string
}

/** Dados fictícios — só para demonstrar preenchimento, nunca dados reais. */
const EXAMPLE_ROWS: ExampleRow[] = [
  {
    nota: '10001234',
    om: 'OM-000123',
    statusSap: 'Aberta',
    centro: 'CT01',
    dataPlanejada: '15/03/2026',
    dataExecucao: '',
    prioridadeSap: 'Alta',
    descricao: 'AVU2026004155 - Recuperação de Cerca',
  },
  {
    nota: '10001235',
    om: 'OM-000124',
    statusSap: 'Em andamento',
    centro: 'CT02',
    dataPlanejada: '20/03/2026',
    dataExecucao: '22/03/2026',
    prioridadeSap: 'Média',
    descricao: 'AVU2026004200 - Poda de árvore próxima à via',
  },
  {
    nota: '10001236',
    om: 'OM-000125',
    statusSap: 'Concluída',
    centro: 'CT01',
    dataPlanejada: '10/03/2026',
    dataExecucao: '12/03/2026',
    prioridadeSap: 'Baixa',
    descricao: 'AVU2026004310 - Sinalização de passagem de nível',
  },
]

/** Exemplos adicionais da aba EXEMPLO — mesma estrutura, mais casos (inclusive um sem AVU localizável). */
const FULL_EXAMPLE_ROWS: ExampleRow[] = [
  ...EXAMPLE_ROWS,
  {
    nota: '10001237',
    om: 'OM-000126',
    statusSap: 'Aberta',
    centro: 'CT03',
    dataPlanejada: '01/04/2026',
    dataExecucao: '',
    prioridadeSap: 'Crítica',
    descricao: 'AVU2026005520 - Recomposição de talude',
  },
  {
    nota: '10001238',
    om: 'OM-000127',
    statusSap: 'Aberta',
    centro: 'CT02',
    dataPlanejada: '03/04/2026',
    dataExecucao: '',
    prioridadeSap: 'Média',
    descricao: 'Manutenção preventiva sem AVU associado — número não localizável nesta descrição',
  },
]

function setHeaderRow(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.getRow(1)
  headers.forEach((header, i) => {
    const cell = row.getCell(i + 1)
    cell.value = header
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
  row.commit()
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

/** "DD/MM/YYYY" -> Date real (não texto) — só assim o `numFmt` de data tem efeito visual no Excel. */
function parseBrDateLiteral(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return null
  const [, day, month, year] = match
  // UTC explícito: evita qualquer deslocamento de fuso horário na volta (`cellToText` lê `Date` via `toISOString()`, que é UTC).
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

function addExampleRows(sheet: ExcelJS.Worksheet, rows: ExampleRow[]) {
  for (const example of rows) {
    const row = sheet.addRow([
      example.nota,
      example.om,
      example.statusSap,
      example.centro,
      parseBrDateLiteral(example.dataPlanejada) ?? example.dataPlanejada,
      parseBrDateLiteral(example.dataExecucao) ?? example.dataExecucao,
      example.prioridadeSap,
      example.descricao,
    ])
    const dataPlanejadaCell = row.getCell(SAP_COLUMN_ORDER.indexOf('dataPlanejada') + 1)
    const dataExecucaoCell = row.getCell(SAP_COLUMN_ORDER.indexOf('dataExecucao') + 1)
    dataPlanejadaCell.numFmt = DATE_FORMAT
    dataExecucaoCell.numFmt = DATE_FORMAT
  }
}

function buildDadosSapSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('DADOS_SAP')
  const headers = SAP_COLUMN_ORDER.map((field) => CANONICAL_HEADERS[field])
  setHeaderRow(sheet, headers)

  SAP_COLUMN_ORDER.forEach((field, i) => {
    sheet.getColumn(i + 1).width = COLUMN_WIDTHS[field]
  })

  addExampleRows(sheet, EXAMPLE_ROWS)

  const lastColumnLetter = sheet.getColumn(SAP_COLUMN_ORDER.length).letter
  sheet.autoFilter = { from: 'A1', to: `${lastColumnLetter}1` }

  // Validação de dados: datas dentro de uma faixa plausível, e uma lista sugerida pra Prioridade.
  const dataPlanejadaCol = sheet.getColumn(SAP_COLUMN_ORDER.indexOf('dataPlanejada') + 1).letter
  const dataExecucaoCol = sheet.getColumn(SAP_COLUMN_ORDER.indexOf('dataExecucao') + 1).letter
  const prioridadeCol = sheet.getColumn(SAP_COLUMN_ORDER.indexOf('prioridadeSap') + 1).letter

  for (let r = 2; r <= 200; r++) {
    sheet.getCell(`${dataPlanejadaCol}${r}`).dataValidation = {
      type: 'date',
      operator: 'between',
      formulae: [new Date(2020, 0, 1), new Date(2035, 11, 31)],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Data inválida',
      error: 'Use o formato DD/MM/AAAA (ex.: 15/03/2026).',
    }
    sheet.getCell(`${dataExecucaoCol}${r}`).dataValidation = {
      type: 'date',
      operator: 'between',
      formulae: [new Date(2020, 0, 1), new Date(2035, 11, 31)],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Data inválida',
      error: 'Use o formato DD/MM/AAAA (ex.: 15/03/2026).',
    }
    sheet.getCell(`${prioridadeCol}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Crítica,Alta,Média,Baixa"'],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Prioridade sugerida',
      error: 'Sugestão: Crítica, Alta, Média ou Baixa (texto livre também é aceito).',
    }
  }

  return sheet
}

interface InstructionRow {
  coluna: string
  obrigatoria: string
  tipo: string
  formato: string
  exemplo: string
  observacoes: string
}

const INSTRUCTION_ROWS: InstructionRow[] = [
  {
    coluna: 'Nota',
    obrigatoria: 'Obrigatória',
    tipo: 'Texto/Número',
    formato: 'Livre — código da nota no SAP',
    exemplo: '10001234',
    observacoes: 'Identifica o registro. Se a mesma Nota já apareceu em outra importação (ou nesta), a linha é marcada como DUPLICADO e não é reprocessada.',
  },
  {
    coluna: 'OM',
    obrigatoria: 'Opcional',
    tipo: 'Texto',
    formato: 'Livre — código da ordem de manutenção',
    exemplo: 'OM-000123',
    observacoes: 'Quando a linha é relacionada a uma AVU, este valor atualiza o campo "Ordem de manutenção" da AVU.',
  },
  {
    coluna: 'Status',
    obrigatoria: 'Opcional',
    tipo: 'Texto',
    formato: 'Livre — status da nota/ordem no SAP',
    exemplo: 'Aberta',
    observacoes: 'Fica só registrado no histórico da importação — nunca sobrescreve o status interno da AVU (que segue seu próprio workflow).',
  },
  {
    coluna: 'Centro',
    obrigatoria: 'Opcional',
    tipo: 'Texto',
    formato: 'Livre — código do centro de custo/manutenção',
    exemplo: 'CT01',
    observacoes: 'Só para referência — não altera nenhum campo da AVU.',
  },
  {
    coluna: 'Data Planejada',
    obrigatoria: 'Opcional',
    tipo: 'Data',
    formato: 'DD/MM/AAAA',
    exemplo: '15/03/2026',
    observacoes: 'Ver seção "Formato de datas aceito" abaixo. Data em formato não reconhecido é ignorada (não bloqueia a linha).',
  },
  {
    coluna: 'Data Execução',
    obrigatoria: 'Opcional',
    tipo: 'Data',
    formato: 'DD/MM/AAAA',
    exemplo: '22/03/2026',
    observacoes: 'Mesma regra de formato da Data Planejada. Deixe em branco se ainda não executada.',
  },
  {
    coluna: 'Prioridade',
    obrigatoria: 'Opcional',
    tipo: 'Texto',
    formato: 'Livre (sugestão: Crítica/Alta/Média/Baixa)',
    exemplo: 'Alta',
    observacoes: 'Só para referência — não altera a prioridade interna da AVU.',
  },
  {
    coluna: 'Descrição',
    obrigatoria: 'Obrigatória',
    tipo: 'Texto',
    formato: 'Livre, contendo o número da AVU em algum ponto do texto',
    exemplo: 'AVU2026004155 - Recuperação de Cerca',
    observacoes:
      'O sistema extrai o número da AVU automaticamente desta coluna usando um padrão (regex) configurável na tela de importação — o padrão padrão é "AVU[0-9A-Z]+". Se nenhum número for encontrado, a linha fica marcada como "AVU não encontrado".',
  },
]

function buildInstrucoesSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('INSTRUÇÕES')
  const headers = ['Coluna', 'Obrigatória/Opcional', 'Tipo de dado', 'Formato esperado', 'Exemplo', 'Observações']
  setHeaderRow(sheet, headers)

  sheet.columns = [
    { width: 18 },
    { width: 20 },
    { width: 14 },
    { width: 34 },
    { width: 32 },
    { width: 60 },
  ]

  for (const item of INSTRUCTION_ROWS) {
    const row = sheet.addRow([item.coluna, item.obrigatoria, item.tipo, item.formato, item.exemplo, item.observacoes])
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' }
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' }
  }

  const lastColumnLetter = sheet.getColumn(headers.length).letter
  sheet.autoFilter = { from: 'A1', to: `${lastColumnLetter}1` }

  const noteRowIndex = INSTRUCTION_ROWS.length + 3
  sheet.getCell(`A${noteRowIndex}`).value = 'Formato de datas aceito pelo sistema'
  sheet.getCell(`A${noteRowIndex}`).font = { bold: true }
  sheet.mergeCells(`A${noteRowIndex}:F${noteRowIndex}`)

  const dateNotes = [
    '• Formato principal: DD/MM/AAAA (ex.: 15/03/2026) — o mesmo padrão usado nas exportações do SAP em português.',
    '• Também aceitos: DD-MM-AAAA e DD.MM.AAAA (ex.: 15-03-2026 ou 15.03.2026).',
    '• Datas já em formato ISO (AAAA-MM-DD, ex.: 2026-03-15) também são aceitas.',
    '• Células de data nativas do Excel (não texto) são lidas automaticamente, sem precisar digitar manualmente.',
    '• Qualquer outro formato é ignorado (a data fica em branco no registro importado) — a linha não é bloqueada por isso.',
  ]
  dateNotes.forEach((note, i) => {
    const rowIndex = noteRowIndex + 1 + i
    sheet.getCell(`A${rowIndex}`).value = note
    sheet.mergeCells(`A${rowIndex}:F${rowIndex}`)
  })

  const requiredNoteRow = noteRowIndex + dateNotes.length + 2
  sheet.getCell(`A${requiredNoteRow}`).value = `Colunas obrigatórias: ${REQUIRED_FIELDS.map((f) => CANONICAL_HEADERS[f]).join(' e ')}. As demais são opcionais — deixe em branco se não houver o dado.`
  sheet.getCell(`A${requiredNoteRow}`).font = { italic: true }
  sheet.mergeCells(`A${requiredNoteRow}:F${requiredNoteRow}`)

  return sheet
}

function buildExemploSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('EXEMPLO')
  const headers = SAP_COLUMN_ORDER.map((field) => CANONICAL_HEADERS[field])
  setHeaderRow(sheet, headers)

  SAP_COLUMN_ORDER.forEach((field, i) => {
    sheet.getColumn(i + 1).width = COLUMN_WIDTHS[field]
  })

  addExampleRows(sheet, FULL_EXAMPLE_ROWS)

  const lastColumnLetter = sheet.getColumn(SAP_COLUMN_ORDER.length).letter
  sheet.autoFilter = { from: 'A1', to: `${lastColumnLetter}1` }

  return sheet
}

/** Monta o workbook do template oficial — isomórfico (funciona no navegador e em Node/testes). */
export function buildSapTemplateWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Gestão de AVU — Serviços Operacionais São Luís EFC'
  workbook.created = new Date()

  // DADOS_SAP precisa ser a PRIMEIRA aba: o parser de XLSX (`parseSapXlsx`) lê `workbook.worksheets[0]`.
  buildDadosSapSheet(workbook)
  buildInstrucoesSheet(workbook)
  buildExemploSheet(workbook)

  return workbook
}

/** Gera o template e dispara o download no navegador com o nome oficial. */
export async function downloadSapTemplate(): Promise<void> {
  const workbook = buildSapTemplateWorkbook()
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = SAP_TEMPLATE_FILE_NAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
