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

## Sprint 6 — Dashboard Executivo (concluída)

`pages/DashboardPage.tsx` (rota `/`) deixou de ser o placeholder estático da Sprint 0 ("dados fictícios") e virou o dashboard executivo pedido: 8 KPIs (Total/Pendentes/Programados/Em Execução/Concluídos/Sem Planejamento/Vencidos/Próximos do Vencimento — `features/dashboard/analytics.ts`, `avuMatchesBucket` como fonte única de verdade), indicadores de tempo médio de atendimento (geral/por gerência/por contratada, via `data_conclusao` novo em `avu_dashboard_view`), 5 gráficos de barra (categoria/local/projeto/emitente/responsável), ranking de áreas críticas (reaproveita `features/avus/risk.ts`), gráfico temporal e mapa de calor de vulnerabilidades (`BaseMap` ganhou uma camada `heatmap` nativa do MapLibre). 9 filtros globais atualizam tudo junto (um único fetch alimenta todos os indicadores). KPIs são clicáveis — abrem `/avus` já filtrada (`pages/AvusPage.tsx` passou a ler `location.state` pro drill-down). Índices novos em `avus` para as colunas de filtro/agrupamento, verificados com `explain analyze` sob carga sintética. Ver `docs/database.md` (migration `0007`) e `docs/testing.md`.

## Sprint 7 — GIS funcional (concluída)

`pages/MapPage.tsx` (rota `/mapa`) deixou de ser o `BaseMap` vazio da Sprint 0 e virou o mapa interativo pedido: cada AVU georreferenciada (e não Cancelada/Reprovada) aparece como marcador colorido por status/urgência (`features/gis/markerColor.ts` — 6 cores, SLA vencido/próximo com prioridade sobre o status bruto), clustering nativo do MapLibre/supercluster (fonte GeoJSON `cluster: true` em `BaseMap`, sem lógica própria de "quando é muito"), painel lateral no clique (`AvuMapPanel.tsx` — número/fotos/descrição/categoria/responsável/prazo/status/OM/nota/empresa/fiscal + "Abrir detalhes"), os mesmos 9 filtros e o mapa de calor da Sprint 6 (reaproveitados, sem duplicar busca de dados), e sincronização mapa↔tabela↔filtros (`DataTable` ganhou `getRowClassName` pra realçar a linha selecionada). Ver `docs/testing.md` e `src/features/gis/README.md` (inclui a seção "preparado para o futuro": rotas/geofencing, captura GPS, app mobile, mapas offline).

**Bug de ambiente encontrado e corrigido na verificação desta sprint**: `BaseMap` esperava o evento `load`/`map.isStyleLoaded()` do MapLibre antes de adicionar qualquer fonte/camada — mas esse evento só dispara quando **todos** os tiles do style base terminam de carregar, o que pode nunca acontecer (ex.: uma fonte de tile lenta/instável trava o evento indefinidamente, mesmo com o style em si já pronto pra receber novas fontes). Isso deixava tanto o clustering (Sprint 7) quanto o mapa de calor (Sprint 6, mesmo padrão) sem nunca renderizar em redes mais lentas. Corrigido: as duas camadas agora tentam adicionar a fonte direto e, se o style ainda não aceitar, tentam de novo no próximo `styledata` — sem depender de `load`. Também foi corrigido um vazamento de camada ao alternar Marcadores↔Mapa de calor (a camada anterior não era removida, ficando sobreposta).

## Sprint 8 — Fiscalização (checklists estruturados)

- Checklists estruturados de campo (itens de verificação, além do par aprovar/reprovar/complementação já existente desde a Sprint 5).
- Ler evidências (`avu_evidences`, Sprint 4, e `avu_attachments`, Sprint 2) com apoio de OCR/IA no futuro (`features/ai`).

## Sprint 9 — Importações (PDF + SAP concluídos)

`pages/ImportsPage.tsx` (rota `/importacoes`, agora atrás de `RequirePermission permission="avus.create"` — antes não tinha guarda nenhuma) deixou de ser o placeholder da Sprint 0 e virou a importação inteligente de PDFs pedida: upload individual ou em lote (drag-and-drop + seletor), fila de processamento (`avu_imports`, migration `0008`) com os 5 estados pedidos, pipeline PDF→OCR→extração de texto→extração de campos→extração de imagens→classificação IA→validação→criação do AVU rodando num Supabase Edge Function novo (`supabase/functions/process-avu-import/`, a primeira function do projeto), tela de revisão (`pages/ImportReviewPage.tsx`) para os casos com confiança abaixo de 80%. Ver `docs/database.md` (migration `0008`) e `docs/testing.md` (inclui as limitações conhecidas de calibração contra um PDF real).

Segunda parte do mesmo épico, integração SAP: `pages/SapImportPage.tsx`/`SapImportDetailPage.tsx` (rotas `/importacao-sap` e `/importacao-sap/:id`, mesma régua de permissão) implementam a importação de arquivos **exportados** do SAP (CSV/XLSX — não conexão direta, fora de escopo), com extração automática do número da AVU da descrição via regex configurável, relacionamento SAP→AVU por match exato normalizado (`sap_imports`/`sap_records`, migration `0009`), tela de inconsistências (processados/relacionados/não relacionados/duplicados/erros) e reprocessamento. Diferente do PDF, roda 100% no client (`papaparse`/`exceljs`) — sem Edge Function. Testado de ponta a ponta (CSV, XLSX, duplicidade dentro e entre lotes, AVU inexistente, atualização de `nota_sap`/`ordem_manutencao`, reprocessamento). Ver `docs/database.md` (migration `0009`) e `docs/architecture.md` ("Integração SAP").

## Sprint 10 — Governança/Rastreabilidade (concluída)

Primeira fatia de um pedido maior ("transformar o MVP numa plataforma inteligente de gestão de vulnerabilidades", 20 frentes — detecção de duplicidade, IA, relatórios, auditoria, notificações, timeline, BI, mobile, segurança, performance, testes, deploy...). Grande demais pra uma sprint só; o usuário escolheu começar por Auditoria + Notificações + Linha do tempo (as 17 frentes restantes ficam listadas em "Depois", abaixo, para sprints seguintes).

Nenhuma tabela nova — tudo em cima de `audit_logs`/`notifications` já existentes desde as Sprints 1/5 (migration `0010_governanca.sql`):
- **Auditoria com diff real**: `audit_avus_change()` passou a gravar `metadata.changes` (só os campos que de fato mudaram, com valor anterior/novo) em vez do genérico `metadata=null` de antes. Nova RPC `log_avu_access` grava "quem acessou" (`action='avu.viewed'`), separado de "quem alterou". Nova página `/auditoria` (`RequirePermission permission="history.view"`) com filtros (entidade/ação/usuário/data) e o diff renderizado por linha.
- **Notificações**: dois novos eventos (nova evidência enviada, Nota/OM do SAP vinculada) somados ao que já existia desde a Sprint 5 (decisão de fiscalização). Prazo próximo/AVU vencida via RPC idempotente chamada sob demanda (`avu_generate_deadline_notifications` — sem `pg_cron`, plano Supabase Free não tem a extensão; ver `docs/architecture.md` para o caminho de upgrade). Nova página `/notificacoes` (central completa, além do sino já existente).
- **Linha do tempo completa**: `AvuTimeline` passou a mesclar também evidências (`avu_evidences`) e vínculo SAP (`sap_records`), além de `audit_logs`/`avu_status_history` que já tinha.

Ver `docs/database.md` (migration `0010`), `docs/architecture.md` ("Governança/Rastreabilidade") e `docs/testing.md`.

## Sprint 11 — Relatórios / PDF

- Escolher e implementar a geração de PDF (`@react-pdf/renderer` vs. Edge Function + Puppeteer — ver `docs/architecture.md`).
- Exportação de laudos de fiscalização e relatórios gerenciais a partir dos dados de `avus`/`audit_logs` já existentes.
- Exportação Excel dos mesmos relatórios.

## Depois

Demais frentes do pedido "plataforma inteligente" (Sprint 10, ver acima) ainda não implementadas — cada uma comparável em escopo a uma sprint:

- **Camada analítica/IA**: detecção de duplicidade (descrição/localização/coordenadas/categoria/proximidade temporal, sempre com validação humana — nunca exclusão automática), identificação de riscos recorrentes (locais/categorias com reincidência), agrupamento de vulnerabilidades semelhantes, resumos executivos automáticos, sugestão (não decisão) de prioridade, busca em linguagem natural com camada seguraça de consulta (nunca SQL arbitrário gerado por IA).
- **Gestão documental**: versionamento e organização central de PDF original/fotos/vídeos/evidências/OM/Nota/histórico/aprovações num só lugar (hoje espalhado entre `avu_attachments`/`avu_evidences`/`sap_records`/`avu_approvals`).
- **BI operacional**: indicadores de produtividade por contratada/fiscal/gerência; dashboard de reincidência por local/categoria/subcategoria/quantidade/frequência.
- **Documentação transversal**: `AI.md`, `SAP.md`, `GIS.md`, `security.md`, `deployment.md`, `api.md` — reescrita/consolidação de toda a documentação, mais natural como sprint dedicada depois que mais funcionalidade estiver implementada.
- **Preparação mobile**: React Native/Expo, offline-first, sincronização, GPS e fotos georreferenciadas — preparar arquitetura/API, não construir o app.
- **Revisão de segurança/performance/testes dedicada**: auditoria completa de RLS/autenticação/autorização/storage/upload/segredos; índices e paginação onde ainda faltam; suíte de testes de integração/workflow (hoje a cobertura é unitária/RLS manual).
- Integração SAP PM completa (sincronização bidirecional de ordens de manutenção, API/OData/BTP — hoje é só importação de arquivo, ver `docs/architecture.md`).
- OCR/IA para leitura automática de evidências e sugestão de classificação de AVUs.
- App mobile (reuso da camada `services/` já isolada da UI).
- Modo offline (cache local via TanStack Query + sincronização).
