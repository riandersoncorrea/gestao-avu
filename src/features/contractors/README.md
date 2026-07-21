# features/contractors

Portal da Contratada — área dedicada e simplificada, fora do `MainLayout` corporativo (`src/layouts/PortalLayout.tsx`), para empresas contratadas acompanharem e executarem suas próprias AVUs.

**Status:** implementado na Sprint 4.

- `evidenceTipo.ts` — `detectEvidenceTipo(mimeType)`, classifica o arquivo automaticamente (foto/vídeo/documento) pelo MIME type.
- `evidenceService.ts` — CRUD de `avu_evidences` (distinta de `avu_attachments`, Sprint 2 — evidência é a submissão formal amarrada à aprovação, com GPS/equipe/equipamentos/data de execução). Upload real no bucket `avu-evidences` (`avus/{avu_id}/evidences/{uuid}-{nome}`).
- `portalService.ts` — `listMyPortalAvus()` (RLS já filtra por `empresa_executante`), `getPortalDashboardStats(avus)` (os 6 indicadores do dashboard).
- `components/` — `PortalDashboardStats` (KPIs), `PortalAvuList` (tabela simples, sem os filtros completos de `/avus`), `EvidenceUploadForm` (upload multi-arquivo + observação/data de execução/equipe/equipamentos/GPS + dispara `avu_submit_evidence`), `EvidenceList` (reaproveitado também na aba "Evidências" do detalhe geral da AVU, `pages/AvuDetailPage.tsx`).

O cadastro/gestão das empresas contratadas em si (`pages/ContractorsPage.tsx`, `/contratadas`) continua sendo uma área administrativa separada — este módulo é a experiência do lado da contratada.
