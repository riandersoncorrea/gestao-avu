import { describe, expect, it } from 'vitest'
import { extractAvuFields } from './extractFields'

// Fixture estruturalmente idêntica ao texto de um PDF de AVU real (mesma
// sequência de linhas — rótulo numa linha, valor na linha seguinte, sem
// dois-pontos, layout em colunas decomposto em pares label/valor
// sequenciais), mas com nomes/e-mail fictícios (o texto real usado pra
// validar esta extração veio de uma AVU de produção real — ver
// docs/testing.md — e não deve ser commitado com dados pessoais reais).
const SAMPLE_PDF_TEXT = `Análise de Vulnerabilidades - AVU Fulano da Silva
Relatório criado em
22/04/2026 às 09:15:19
AVU2026004155
Criado por
Fulano da Silva
Criada em
17/04/2026 08:40
Gerência Responsável pelo tratamento
GER FACILITIES EXEMPLO - CICLANO DE SOUZA
Email Gerência Responsável pelo tratamento
ciclano.souza@example.com
Gerência
GALNR
Data do Evento
17/04/2026
Hora do Evento
08:34
Data Limite de
Resolução
17/05/2026
GUT
(15) Prioridade 2
AVU encerrada?
Não
Emitentes
Beltrana Oliveira
Empresa Responsável
EMPRESA EXEMPLO S/A
Projeto
TMPM
Local
ÁREA VERDE - EXEMPLO
Especificação do Local
PRÉDIO ADMINISTRATIVO
País
Brasil
Estado
Maranhão
Município
São Luís
Latitude
-2.5632
Longitude
-44.3719
Descrição
Local: Cerca perimetral Exemplo
Vulnerabilidade: Vegetação alta
O Local possui fluxo de pessoas e/ou carros. O local não possui controle de acesso.
Põe em risco a integridade física de alguém
e/ou cabe registro de N3?
Sim
Complexidade de tratamento
Rever processo`

describe('extractAvuFields', () => {
  it('extrai todos os campos de um PDF real (rótulo numa linha, valor na linha seguinte)', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)

    expect(result.numeroAvu).toBe('AVU2026004155')
    expect(result.dataCriacao).toBe('2026-04-17')
    expect(result.gerenciaResponsavel).toBe('GER FACILITIES EXEMPLO - CICLANO DE SOUZA')
    expect(result.dataLimite).toBe('2026-05-17')
    expect(result.emitenteNome).toBe('Beltrana Oliveira')
    expect(result.projeto).toBe('TMPM')
    expect(result.local).toBe('ÁREA VERDE - EXEMPLO')
    expect(result.latitude).toBeCloseTo(-2.5632)
    expect(result.longitude).toBeCloseTo(-44.3719)
    expect(result.descricao).toContain('Vegetação alta')
    expect(result.descricao).toContain('controle de acesso.')
    expect(result.missingFields).toEqual([])
  })

  it('número da AVU vem do padrão "AVU<dígitos>" (cabeçalho), não de um rótulo — o modelo real não tem "Número do AVU:"', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)
    expect(result.numeroAvu).toBe('AVU2026004155')
  })

  it('não confunde "Gerência" (campo curto, código) com "Gerência Responsável pelo tratamento" (campo completo) — bug real encontrado por prefixo', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)
    expect(result.gerenciaResponsavel).toBe('GER FACILITIES EXEMPLO - CICLANO DE SOUZA')
    expect(result.gerenciaResponsavel).not.toContain('GALNR')
  })

  it('reconhece "Emitentes" (plural, como no modelo real) sem truncar pro "Emitente" singular', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)
    expect(result.emitenteNome).toBe('Beltrana Oliveira')
  })

  it('reconhece rótulo de duas linhas ("Data Limite de" / "Resolução")', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)
    expect(result.dataLimite).toBe('2026-05-17')
  })

  it('extrai só a data quando o valor vem com hora junto ("Criada em" → "17/04/2026 08:40")', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)
    expect(result.dataCriacao).toBe('2026-04-17')
  })

  it('descrição para no próximo rótulo conhecido, não engole o resto do documento', () => {
    const result = extractAvuFields(SAMPLE_PDF_TEXT)
    expect(result.descricao).not.toContain('Complexidade de tratamento')
    expect(result.descricao).not.toContain('integridade física')
  })

  it('reporta todos os campos pedidos como faltando quando o texto não tem nenhum rótulo reconhecido', () => {
    const result = extractAvuFields('Um texto qualquer sem nenhum rótulo conhecido.')
    expect(result.missingFields).toEqual([
      'numeroAvu',
      'dataCriacao',
      'gerenciaResponsavel',
      'dataLimite',
      'emitenteNome',
      'projeto',
      'local',
      'latitude',
      'longitude',
      'descricao',
    ])
  })

  it('aceita datas já em formato ISO', () => {
    const text = 'Criada em\n2026-01-01\nDescrição\nTeste.'
    const result = extractAvuFields(text)
    expect(result.dataCriacao).toBe('2026-01-01')
  })

  it('retorna null para datas em formato não reconhecido', () => {
    const text = 'Criada em\n1 de janeiro de 2026\nDescrição\nTeste.'
    const result = extractAvuFields(text)
    expect(result.dataCriacao).toBeNull()
    expect(result.missingFields).toContain('dataCriacao')
  })

  it('trata texto completamente vazio sem lançar exceção', () => {
    const result = extractAvuFields('')
    expect(result.missingFields.length).toBeGreaterThan(0)
  })
})
