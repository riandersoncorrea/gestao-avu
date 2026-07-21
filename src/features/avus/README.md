# features/avus

Núcleo do sistema: ciclo de vida da AVU (Análise de Vulnerabilidade) — identificação, planejamento, execução, fiscalização e encerramento.

**Status:** implementado na Sprint 2.

- `types.ts` — `Avu`, `AvuStatus` (10 valores), `AvuFilters`, `AvuComment`, `AvuAttachment`.
- `avuService.ts` — CRUD, RPCs (`avu_submit_evidence`, `avu_review_execution`), comentários e anexos (Storage).
- `sla.ts` — cálculo de SLA (`no_prazo`/`proximo_vencimento`/`vencido`/`encerrado`), testado em `sla.test.ts`.
- `permissions.ts` — espelha `can_write_avu_related()` do banco só para UX (a autorização real é RLS/RPC).
- `components/` — `AvuForm`, `AvuFiltersBar`, `AvuStatusBadge`, `SlaBadge`, `AvuTimeline`, `AvuComments`, `AvuAttachments`, `AvuLocationMap`.

Escopo por linha (Fiscal só vê atribuídas a si, Contratada só vê as da própria empresa, Gestor só vê as da própria área) é reforçado por `can_view_avu()` no Postgres (`supabase/migrations/0003_avus.sql`), não pelo frontend.
