# features/imports

Importação inteligente de PDFs (`pages/ImportsPage.tsx`, rota `/importacoes`; `pages/ImportReviewPage.tsx`, rota `/importacoes/:id`) — upload individual ou em lote, fila de processamento, revisão humana quando a confiança da classificação fica abaixo de 80%.

**Status:** implementado na Sprint 9. Ver `docs/architecture.md` ("Importação de PDF e abstração de `AIProvider`"), `docs/database.md` (migration `0008`) e `docs/testing.md` (limitações conhecidas + script de verificação).

- `types.ts` — `AvuImportStatus`, `AvuImport`, `AvuImportLog`, `ExtractedFields`.
- `taxonomy.ts` — as 4 categorias + subcategorias da classificação IA. **Duplicada** em `supabase/functions/process-avu-import/lib/subcategories.ts` (Edge Function e frontend são builds/runtimes separados — mesmo padrão já aceito para a matriz de permissões RBAC, ver `CLAUDE.md`). Mantenha as duas em sincronia.
- `importService.ts` — `stageImport(file)` (upload pro bucket de staging + RPC `avu_import_start`), `processImport(importId)` (invoca a Edge Function), `retryImport`, `confirmImport`, `listImports`/`getImport`/`listImportLogs`, `getStagingPdfUrl`.
- `components/AvuImportStatusBadge.tsx` — badge dos 5 estados (`AGUARDANDO`/`PROCESSANDO`/`PROCESSADO`/`ERRO`/`REVISAO_NECESSARIA`).

O processamento de verdade (OCR/extração/classificação/criação da AVU) roda inteiro em `supabase/functions/process-avu-import/` — a chave de IA nunca fica no frontend. Este módulo só orquestra upload, fila e revisão; nunca faz a extração/classificação ele mesmo.

`pages/ImportsPage.tsx`/`ImportReviewPage.tsx` estão atrás de `RequirePermission permission="avus.create"` — mesma régua de quem pode criar uma AVU diretamente (hoje só `admin`/`seguranca_empresarial`).
