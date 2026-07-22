# features/sap

Importação SAP (`pages/SapImportPage.tsx`/`SapImportDetailPage.tsx`, rotas `/importacao-sap` e `/importacao-sap/:id`) — importação de arquivos **exportados** do SAP (CSV/XLSX) para relacionar e atualizar AVUs existentes.

**Status:** implementado na Sprint 9 (segunda parte, depois da importação de PDF). **MVP explícito: não há conexão direta com o SAP** (API/OData/BTP) — só arquivo exportado, processado em lote.

- `extractAvuNumero.ts` (+ `.test.ts`) — função pura que extrai o número da AVU da descrição via regex configurável (padrão `AVU[0-9A-Z]+`). O padrão usado em cada importação é gravado em `sap_imports.regex_pattern`, não numa tabela de configuração separada.
- `parsers/csv.ts` (`papaparse`) e `parsers/xlsx.ts` (`exceljs` — escolhido em vez de `xlsx`/SheetJS por estar integralmente no registro npm público) — convergem para a mesma forma normalizada (`SapParsedRow`) via `parsers/shared.ts` (`HEADER_ALIASES` mapeia variações de cabeçalho para os 8 campos pedidos: Nota/OM/Status/Centro/Data Planejada/Data Execução/Prioridade/Descrição).
- `sapImportService.ts` — `startImport`/`processImport`/`retryImport`/`listImports`/`getImport`/`listRecords`, todas fazendo `supabase.rpc(...)` (nunca `INSERT`/`UPDATE` direto na tabela — o casamento com AVU é lógica de servidor).
- `components/SapStatusBadges.tsx` — badges de status de importação (`sap_imports.status`) e de match por linha (`sap_records.match_status`).
- `types.ts` — `SapImport`, `SapRecord`, `SapParsedRow`, `SapBatchSummary`.

## Decisões importantes

- **Parsing 100% client-side, sem Edge Function**: diferente da importação de PDF (`features/imports/`), CSV/XLSX não envolve nenhum segredo — todo o parsing roda no navegador. O casamento SAP→AVU é uma RPC Postgres comum (`sap_import_process_batch`).
- **Match exato normalizado, não flexível**: `normalize_avu_numero()` (Postgres) remove tudo que não é letra/dígito e uppercasa antes de comparar `avus.numero_avu` com o número extraído da descrição — decisão deliberada por segurança, evita ligar a AVU errada.
- **Atualização de AVU restrita a `nota_sap`/`ordem_manutencao`**: Status/Centro/Datas/Prioridade do SAP (`sap_records.status_sap`/`centro`/`data_planejada`/`data_execucao`/`prioridade_sap`) nunca sobrescrevem os campos internos de workflow da AVU.
- **Duplicata = mesma "Nota" já vista**, nesta importação ou em qualquer anterior — verificado globalmente em `sap_records`, não só dentro do arquivo atual.
- **Reprocessamento (`sap_import_retry`)** reaplica o casamento sobre os `sap_records` já salvos, sem reimportar o arquivo — útil depois de ajustar o regex ou quando mais AVUs passam a existir.

Ver `docs/database.md` (migration `0009_sap_imports.sql`) e `docs/architecture.md` ("Integração SAP") para o detalhamento completo.

## Preparado para o futuro

A arquitetura atual não constrói cliente HTTP especulativo para nada disso — mas já deixa o caminho claro:

- **SAP API / SAP OData**: quando existir, um novo service (`services/sapApiService.ts`, seguindo o padrão de `profileService.ts`) chamaria a API/OData diretamente e alimentaria a mesma RPC `sap_import_process_batch` (ou uma variante dela) com os registros — o contrato de dados (`SapParsedRow`) já é o mesmo, independente da origem ser arquivo ou API.
- **SAP BTP / integração corporativa**: mesma lógica — a peça que muda é só a origem dos registros; casamento, duplicata, atualização de AVU e tela de inconsistências não mudam.
- **Sincronização bidirecional**: hoje o fluxo é só SAP → AVU (leitura). Escrever de volta no SAP (ex.: status da AVU refletido numa ordem de manutenção) é um próximo passo natural quando uma dessas integrações existir de verdade.
