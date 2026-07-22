-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0007: Dashboard Executivo — índices para os filtros globais e a view
-- que traz status_since/data_conclusao para os indicadores de tempo médio e risco.

-- ---------------------------------------------------------------------------
-- Índices — hoje só existem em status/fiscal/responsavel/data_limite (Sprint 2).
-- Os filtros globais do dashboard (Gerência/Categoria/Projeto/Local/Empresa/
-- Emitente/Período) e os agrupamentos dos gráficos usam estas colunas.
-- ---------------------------------------------------------------------------
create index avus_categoria_idx on public.avus (categoria);
create index avus_local_idx on public.avus (local);
create index avus_projeto_idx on public.avus (projeto);
create index avus_gerencia_responsavel_idx on public.avus (gerencia_responsavel);
create index avus_empresa_executante_idx on public.avus (empresa_executante);
create index avus_emitente_idx on public.avus (emitente);
create index avus_data_criacao_idx on public.avus (data_criacao);

-- ---------------------------------------------------------------------------
-- avu_dashboard_view — avus + status_since (mesmo cálculo de avu_planning_view,
-- reaproveitado aqui para poder usar deriveAvuRisk no ranking de áreas críticas)
-- + data_conclusao (nova: última transição para CONCLUIDO em avu_status_history,
-- usada para "tempo médio de atendimento").
-- ---------------------------------------------------------------------------
create view public.avu_dashboard_view
with (security_invoker = true)
as
select
  a.*,
  coalesce(latest.created_at, a.created_at) as status_since,
  concluded.created_at as data_conclusao
from public.avus a
left join lateral (
  select h.created_at
  from public.avu_status_history h
  where h.avu_id = a.id
  order by h.created_at desc
  limit 1
) latest on true
left join lateral (
  select h.created_at
  from public.avu_status_history h
  where h.avu_id = a.id and h.new_status = 'CONCLUIDO'
  order by h.created_at desc
  limit 1
) concluded on true;

comment on view public.avu_dashboard_view is 'avus + status_since + data_conclusao — usada pelo Dashboard Executivo para tempo médio de atendimento e ranking de áreas críticas (deriveAvuRisk precisa de status_since).';
