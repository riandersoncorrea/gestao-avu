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

## Sprint 4 — GIS funcional

- Camada vetorial com **todas** as AVUs georreferenciadas sobre o `BaseMap` (hoje o mapa só plota uma AVU por vez, na aba "Localização" do detalhe).
- Definição do provedor de tiles definitivo (avaliar dados SIG corporativos da Vale vs. provedor externo tipo MapTiler).

## Sprint 5 — Fiscalização (checklists)

- Checklists estruturados de campo (itens de verificação, não só o par aprovar/reprovar já existente).
- Ler evidências (fotos já suportadas via `avu_attachments`) com apoio de OCR/IA no futuro (`features/ai`).

## Sprint 6 — Importações

- Importação de planilhas/dados externos.
- Primeiro rascunho de integração SAP PM (`features/sap`, `services/`) — os campos `nota_sap`/`ordem_manutencao` já existem em `avus`.

## Sprint 7 — Relatórios / PDF

- Escolher e implementar a geração de PDF (`@react-pdf/renderer` vs. Edge Function + Puppeteer — ver `docs/architecture.md`).
- Exportação de laudos de fiscalização e relatórios gerenciais a partir dos dados de `avus`/`audit_logs` já existentes.

## Sprint 8 — Portal da contratada

- Área dedicada (fora do `MainLayout` corporativo) para contratadas acompanharem/atualizarem suas próprias AVUs — hoje elas já acessam via `/avus` normal (RLS já restringe à própria empresa), mas uma experiência dedicada e mais simples pode fazer sentido para esse público externo.

## Depois

- Integração SAP PM completa (sincronização bidirecional de ordens de manutenção).
- OCR/IA para leitura automática de evidências e sugestão de classificação de AVUs.
- App mobile (reuso da camada `services/` já isolada da UI).
- Modo offline (cache local via TanStack Query + sincronização).
