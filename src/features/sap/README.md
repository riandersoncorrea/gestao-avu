# features/sap

Importação SAP (`pages/SapImportPage.tsx`/`SapImportDetailPage.tsx`, rotas `/importacao-sap` e `/importacao-sap/:id`) — importação de arquivos **exportados** do SAP (CSV/XLSX) para relacionar e atualizar AVUs existentes.

**Status:** implementado na Sprint 9 (segunda parte, depois da importação de PDF). **MVP explícito: não há conexão direta com o SAP** (API/OData/BTP) — só arquivo exportado, processado em lote.

- `extractAvuNumero.ts` (+ `.test.ts`) — função pura que extrai o número da AVU da descrição via regex configurável (padrão `AVU[0-9A-Z]+`). O padrão usado em cada importação é gravado em `sap_imports.regex_pattern`, não numa tabela de configuração separada.
- `parsers/shared.ts` (+ `.test.ts`) — fonte única de verdade das 8 colunas esperadas (`SAP_COLUMN_ORDER`/`CANONICAL_HEADERS`/`HEADER_ALIASES`), usada tanto pelos parsers quanto pelo gerador do template. `parseAndValidateSapRows()` faz parsing **e** validação numa passada só: colunas obrigatórias ausentes bloqueiam o import (`hasBlockingErrors`); colunas desconhecidas, linhas sem Nota/Descrição e datas em formato não reconhecido viram avisos não bloqueantes — nenhuma dessas validações altera a lógica de relacionamento SAP→AVU, que continua inteiramente no banco.
- `parsers/csv.ts` (`papaparse`) e `parsers/xlsx.ts` (`exceljs` — escolhido em vez de `xlsx`/SheetJS por estar integralmente no registro npm público) — convergem para a mesma forma validada (`SapParseOutcome`) via `parseAndValidateSapRows`.
- `sapTemplate.ts` (+ `.test.ts`) — gera o template oficial `template_importacao_sap.xlsx` (3 abas: DADOS_SAP/INSTRUÇÕES/EXEMPLO) 100% a partir das mesmas constantes de `parsers/shared.ts` — não há risco de o template e o parser divergirem, porque compartilham a fonte. `downloadSapTemplate()` gera e dispara o download no navegador (botão "Baixar modelo Excel" em `SapImportPage.tsx`).
- `sapImportService.ts` — `startImport`/`processImport`/`retryImport`/`listImports`/`getImport`/`listRecords`, todas fazendo `supabase.rpc(...)` (nunca `INSERT`/`UPDATE` direto na tabela — o casamento com AVU é lógica de servidor).
- `components/SapStatusBadges.tsx` — badges de status de importação (`sap_imports.status`) e de match por linha (`sap_records.match_status`).
- `types.ts` — `SapImport`, `SapRecord`, `SapParsedRow`, `SapBatchSummary`.

## Decisões importantes

- **Parsing 100% client-side, sem Edge Function**: diferente da importação de PDF (`features/imports/`), CSV/XLSX não envolve nenhum segredo — todo o parsing roda no navegador. O casamento SAP→AVU é uma RPC Postgres comum (`sap_import_process_batch`).
- **Match exato normalizado, não flexível**: `normalize_avu_numero()` (Postgres) remove tudo que não é letra/dígito e uppercasa antes de comparar `avus.numero_avu` com o número extraído da descrição — decisão deliberada por segurança, evita ligar a AVU errada.
- **Atualização de AVU restrita a `nota_sap`/`ordem_manutencao`**: Status/Centro/Datas/Prioridade do SAP (`sap_records.status_sap`/`centro`/`data_planejada`/`data_execucao`/`prioridade_sap`) nunca sobrescrevem os campos internos de workflow da AVU.
- **Duplicata = mesma "Nota" já vista**, nesta importação ou em qualquer anterior — verificado globalmente em `sap_records`, não só dentro do arquivo atual.
- **Reprocessamento (`sap_import_retry`)** reaplica o casamento sobre os `sap_records` já salvos, sem reimportar o arquivo — útil depois de ajustar o regex ou quando mais AVUs passam a existir.
- **Validação de arquivo não bloqueia por dado de linha ruim**: só a ausência de uma coluna obrigatória (Nota/Descrição) impede o import inteiro — o mesmo princípio de resiliência por linha já usado na RPC de processamento (`sap_import_process_batch`), aplicado também no pré-check do client.
- **Nota e Descrição são as únicas colunas obrigatórias** (`REQUIRED_FIELDS` em `parsers/shared.ts`) — são as que de fato importam pro sistema (identidade do registro e extração do número da AVU); OM/Status/Centro/Datas/Prioridade são só contexto.

Ver `docs/database.md` (migration `0009_sap_imports.sql`) e `docs/architecture.md` ("Integração SAP") para o detalhamento completo.

## Preparado para o futuro

A arquitetura atual não constrói cliente HTTP especulativo para nada disso — mas já deixa o caminho claro:

- **SAP API / SAP OData**: quando existir, um novo service (`services/sapApiService.ts`, seguindo o padrão de `profileService.ts`) chamaria a API/OData diretamente e alimentaria a mesma RPC `sap_import_process_batch` (ou uma variante dela) com os registros — o contrato de dados (`SapParsedRow`) já é o mesmo, independente da origem ser arquivo ou API.
- **SAP BTP / integração corporativa**: mesma lógica — a peça que muda é só a origem dos registros; casamento, duplicata, atualização de AVU e tela de inconsistências não mudam.
- **Sincronização bidirecional**: hoje o fluxo é só SAP → AVU (leitura). Escrever de volta no SAP (ex.: status da AVU refletido numa ordem de manutenção) é um próximo passo natural quando uma dessas integrações existir de verdade.
