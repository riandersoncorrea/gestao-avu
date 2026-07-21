# features/inspections

Fiscalização: fila de trabalho do Fiscal por status/decisão, e a tela de análise onde ele aprova, reprova ou solicita complementação de evidências.

**Status:** implementado na Sprint 5.

- `types.ts` — `ApprovalDecision` (`aprovado`/`reprovado`/`complementacao`), `FiscalizacaoBucket` (os 4 grupos da fila).
- `approvalService.ts` — `mapBucketToQuery(bucket)` (função pura: 3 dos 4 buckets são filtro de `status`; "Reprovados" é filtro de `latest_decision`, porque reprovar manda a AVU para `EM_EXECUCAO`, não para o status `REPROVADO`), `listAvusForInspection(bucket)` (lê `avu_fiscalizacao_view`, mesmo padrão de `planningService.ts` — resolve nomes de perfil à parte, sem depender de embed de FK através de view), `reviewEvidence(avuId, decision, comment?)` (RPC `avu_review_evidence`, `supabase/migrations/0006_fiscalizacao.sql`).
- `components/InspectionAvuList.tsx` — `DataTable` reaproveitado.

A tela de análise (`pages/InspectionReviewPage.tsx`) reaproveita `AvuAttachments`/`EvidenceList` (`features/contractors/`) lado a lado para a comparação Antes (anexos genéricos) x Depois (evidências da Contratada) — não há componente de comparação dedicado.
