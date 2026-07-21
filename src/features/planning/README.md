# features/planning

Fluxo operacional das AVUs (transições de status validadas no banco) e o pipeline de planejamento (Nota SAP → OM → programação).

**Status:** implementado na Sprint 3.

- `transitions.ts` — espelha o grafo de `avu_status_transitions` do banco (`supabase/migrations/0004_workflow_and_planning.sql`) só para a UI saber quais opções mostrar; a validação de verdade é o trigger `avus_validate_status_transition`.
- `kanbanColumn.ts` — deriva a coluna do Kanban a partir de `status` + `nota_sap`/`ordem_manutencao`/`data_limite` (não é um campo no banco).
- `planningService.ts` — lê de `avu_planning_view` (traz `status_since` sem N+1 query), chama a RPC `avu_transition_status` e a edição direta de campos de planejamento.
- `components/` — `KanbanBoard`/`KanbanCard`, `PlanningTable`, `PlanningFiltersBar`, `PlanningAlerts` (5 alertas automáticos, clicáveis para filtrar), `StatusTransitionControl` (reaproveitado também no detalhe da AVU), `QuickEditModal` (ação de planejamento: Nota SAP/OM/prazo/prioridade).

Indicador de risco (`features/avus/risk.ts`) e prioridade (`avus.prioridade`) alimentam badges tanto aqui quanto no detalhe da AVU.
