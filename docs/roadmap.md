# Roadmap — Gestão de AVU

## Sprint 0 — Fundação técnica (concluída)

Scaffolding (Vite + React + TS + Tailwind v4), design system, layout (Sidebar/Header/MainLayout), navegação entre as 9 áreas, componentes reutilizáveis, mapa base (MapLibre GL), estrutura inicial de banco (`profiles`/`roles`/`permissions`/`audit_logs` + RLS) e esta documentação.

## Sprint 1 — Autenticação e controle de acesso (concluída)

Supabase Auth ligado de verdade (login, logout, recuperação de senha, controle de sessão), RBAC completo para os 7 perfis do negócio (`admin`, `seguranca_empresarial`, `planejamento`, `fiscal`, `contratada`, `gestor`, `leitor`) via `user_roles`/`role_permissions`, guardas de rota (`RequireAuth`/`RequireAdmin`/`RequirePermission`), cadastro por convite validado no banco (sem `service_role key` no cliente), tela de administração de usuários/convites, e testes automatizados (Vitest) para a lógica de permissões e os guards de rota. Ver `docs/database.md` (migration `0002_rbac_and_invites.sql`) e `docs/testing.md`.

**Pendência conhecida**: `avus.view_assigned` (Fiscal/Contratada) e `avus.view_area` (Gestor) já existem como chaves de permissão, mas só ganham escopo real por linha (RLS filtrando por atribuição/empresa/área) quando a tabela `avus` existir — isso é o primeiro item da Sprint 2.

## Sprint 2 — AVUs, núcleo do sistema (concluída)

CRUD completo de AVUs (`supabase/migrations/0003_avus.sql`) com os 10 status do ciclo de vida, escopo real por linha via `can_view_avu()`/`can_write_avu_related()` (Fiscal só vê as atribuídas a si, Contratada só as da própria empresa — `profiles.company_name`, Gestor só as da própria área — `profiles.area`), listagem com filtros/busca global, página de detalhe com 7 abas (Resumo/Informações/Localização/Documentos/Fotos/Histórico/Comentários), timeline via `audit_logs`, comentários, anexos reais no Supabase Storage, indicadores de SLA (`no prazo`/`próximo do vencimento`/`vencido`/`encerrado`), e as duas ações sensíveis como RPCs `security definer` (`avu_submit_evidence` para Contratada, `avu_review_execution` para Fiscal). Ver `docs/database.md` e `docs/testing.md`.

**O que isso já cobre de sprints futuras**: o fluxo de "Contratada envia evidência → Fiscal aprova/reprova" (que estava previsto para as Sprints 5/8) já existe dentro do próprio detalhe da AVU. As próximas sprints de Fiscalização/Portal da contratada podem focar no que falta (checklists estruturados, área dedicada) em vez de reconstruir esse fluxo básico.

## Sprint 3 — Fluxo operacional e Planejamento (concluída)

Máquina de estados reforçada no Postgres (`supabase/migrations/0004_workflow_and_planning.sql`): trigger `avus_validate_status_transition` bloqueia qualquer transição de `status` fora do grafo permitido (mesmo via `UPDATE` direto, não só pela RPC), com `avu_status_history` registrando ator/data/status anterior/novo/comentário — timeline do detalhe da AVU passou a mesclar isso com `audit_logs`. Nova RPC genérica `avu_transition_status` (ação de planejamento) para o caminho linear NOVO→...→CONCLUIDO, mantendo `avu_submit_evidence`/`avu_review_execution` (Sprint 2) como os únicos caminhos para as transições de Fiscal/Contratada. Adicionado `avus.prioridade` (enum) e indicador de risco calculado (`features/avus/risk.ts`, combina SLA + prioridade + tempo parado no status). Página de Planejamento reescrita com Kanban (11 colunas, incluindo a pipeline Nota SAP → OM → prazo derivada dos campos existentes, mais um catch-all "Vencido") e Tabela, alertas automáticos clicáveis, e filtros de prioridade/risco/coluna/prazo. Ver `docs/database.md` e `docs/testing.md`.

## Sprint 4 — Portal da Contratada (concluída)

Área dedicada e simplificada, fora do `MainLayout` corporativo (`src/layouts/PortalLayout.tsx`, rotas `/portal`), antecipada desta posição do roadmap (era a Sprint 8) porque o pedido do usuário veio explícito. Usuário cujo único papel é `contratada` é redirecionado automaticamente para lá; admin acessa ambas as áreas. Dashboard com os 6 indicadores pedidos (`features/contractors/portalService.ts`), lista de AVUs da própria empresa, e — a peça que faltava desde a Sprint 2 — envio real de evidências (fotos/vídeos/documentos) com observações, data de execução, equipe, equipamentos e captura de GPS (`supabase/migrations/0005_contractor_portal.sql`, tabela `avu_evidences`, bucket `avu-evidences`). `avu_submit_evidence` passa a exigir ao menos uma evidência anexada antes de transicionar para `AGUARDANDO_APROVACAO`. Nova aba "Evidências" no detalhe geral da AVU dá ao Fiscal o contexto que faltava para aprovar/reprovar. Ver `docs/database.md` e `docs/testing.md`.

## Sprint 5 — Fiscalização (concluída)

Tela dedicada de análise do Fiscal (`pages/InspectionsPage.tsx` — fila por bucket — e `pages/InspectionReviewPage.tsx` — tela de decisão), substituindo o card simples "Revisão de execução" do detalhe da AVU (Sprint 2). Três decisões (aprovar/reprovar/solicitar complementação de evidências) via nova RPC `avu_review_evidence` (`supabase/migrations/0006_fiscalizacao.sql`), com uma diferença importante: **reprovar manda a AVU direto para `EM_EXECUCAO`**, não para o status `REPROVADO` (pedido explícito) — por isso o bucket "Reprovados" da fila usa a última decisão registrada em `avu_approvals` (nova tabela de auditoria dedicada), não o status ao vivo. Comparação visual Antes (`avu_attachments`, Sprint 2) x Depois (`avu_evidences`, Sprint 4) lado a lado, reaproveitando os componentes já existentes — sem código novo de preview. Notificações in-app reais (`notifications`, fan-out para Contratada/Planejamento/Segurança Empresarial a cada decisão) substituem o sino decorativo do `Header` desde a Sprint 0. Ver `docs/database.md` e `docs/testing.md`.

**Bug de segurança encontrado e corrigido na verificação desta sprint**: a checagem de autorização `has_role('fiscal') and v_avu.fiscal = auth.uid()` dentro de um `if not (...)` deixava passar qualquer Fiscal quando a AVU não tinha fiscal atribuído (`fiscal is null`), por causa da lógica de três valores do PL/pgSQL (`false or null` = `null`, e `if null` não dispara `raise exception`). Corrigido com `v_avu.fiscal is not null and ...` explícito.

## Sprint 6 — GIS funcional

- Camada vetorial com **todas** as AVUs georreferenciadas sobre o `BaseMap` (hoje o mapa só plota uma AVU por vez, na aba "Localização" do detalhe).
- Definição do provedor de tiles definitivo (avaliar dados SIG corporativos da Vale vs. provedor externo tipo MapTiler).

## Sprint 7 — Fiscalização (checklists estruturados)

- Checklists estruturados de campo (itens de verificação, além do par aprovar/reprovar/complementação já existente desde a Sprint 5).
- Ler evidências (`avu_evidences`, Sprint 4, e `avu_attachments`, Sprint 2) com apoio de OCR/IA no futuro (`features/ai`).

## Sprint 8 — Importações

- Importação de planilhas/dados externos.
- Primeiro rascunho de integração SAP PM (`features/sap`, `services/`) — os campos `nota_sap`/`ordem_manutencao` já existem em `avus`.

## Sprint 9 — Relatórios / PDF

- Escolher e implementar a geração de PDF (`@react-pdf/renderer` vs. Edge Function + Puppeteer — ver `docs/architecture.md`).
- Exportação de laudos de fiscalização e relatórios gerenciais a partir dos dados de `avus`/`audit_logs` já existentes.

## Depois

- Integração SAP PM completa (sincronização bidirecional de ordens de manutenção).
- OCR/IA para leitura automática de evidências e sugestão de classificação de AVUs.
- App mobile (reuso da camada `services/` já isolada da UI).
- Modo offline (cache local via TanStack Query + sincronização).
