# features/reports

Dois relatórios distintos (Sprint 11):

1. **Laudo por AVU** (`AvuLaudoDocument.tsx`/`avuLaudoPdf.ts`/`avuLaudoService.ts`) — PDF com Número AVU, Descrição, Fotos antes (`avu_attachments` kind=photo), Fotos depois (`avu_evidences` tipo=foto), Data de criação/conclusão, Responsável, OM, Nota SAP e Conclusão (última decisão de fiscalização, ou o status atual como fallback — `describeConclusao.ts`, função pura testada). Botão "Relatório PDF" no detalhe da AVU (`AvuDetailPage.tsx`).
2. **Relatório gerencial em lote** (`AvusReportDocument.tsx`/`avusReportPdf.ts`, `avusReportExcel.ts`) — PDF (paisagem, tabular) e Excel de um conjunto de AVUs filtrado, gerado em `pages/ReportsPage.tsx` reaproveitando `AvuFiltersBar`/`listAvus` já existentes em `features/avus/`.

## Decisões

- **100% client-side**: PDF via `@react-pdf/renderer`, Excel via `exceljs` (já usado desde a Sprint 9/SAP) — nenhum segredo envolvido, sem Edge Function, mesmo padrão já seguido no resto do projeto.
- **Fotos via signed URL existente**: `getAttachmentUrl`/`getEvidenceUrl` (já existentes, 10 min de validade) são passadas direto pro `<Image src=.../>` do react-pdf — sem baixar/reprocessar bytes manualmente.
- **`services/pdf/` não é usado aqui**: aquele contrato (`PdfDocumentDefinition`/`generatePdf`) é só texto genérico (heading/body), não serve pra um laudo com campos estruturados e fotos. Continua existindo como estava, documentado, não implementado — esta sprint vive inteiramente em `features/reports/`.
- **Sem preview em tela**: gera o arquivo e dispara o download direto (mesmo padrão de `downloadSapTemplate`), sem visualizador embutido.
- **Sem permissão nova**: `/relatorios` não ganhou nenhuma chave de permissão nova — a segurança de verdade já vem da RLS nas mesmas tabelas (`avus`/`avu_attachments`/`avu_evidences`/`avu_approvals`) que o resto do app usa; quem gera um laudo/exporta só vê as AVUs que já podia ver.
