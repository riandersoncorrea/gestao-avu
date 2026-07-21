-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0004: máquina de estados do fluxo operacional (transições validadas no banco,
-- histórico rico com comentário), prioridade, e a view usada pelo módulo de Planejamento.

-- ---------------------------------------------------------------------------
-- prioridade
-- ---------------------------------------------------------------------------
create type public.avu_priority as enum ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA');

alter table public.avus add column prioridade public.avu_priority not null default 'MEDIA';

-- ---------------------------------------------------------------------------
-- Grafo de transições permitidas (dados de referência, leitura aberta)
-- ---------------------------------------------------------------------------
create table public.avu_status_transitions (
  from_status public.avu_status not null,
  to_status public.avu_status not null,
  primary key (from_status, to_status)
);

comment on table public.avu_status_transitions is 'Grafo de transições de status permitidas para avus.status — reforçado por trigger, não só pelo frontend.';

insert into public.avu_status_transitions (from_status, to_status) values
  ('NOVO', 'TRIAGEM'),
  ('NOVO', 'CANCELADO'),
  ('TRIAGEM', 'PLANEJAMENTO'),
  ('TRIAGEM', 'CANCELADO'),
  ('PLANEJAMENTO', 'PROGRAMADO'),
  ('PLANEJAMENTO', 'CANCELADO'),
  ('PROGRAMADO', 'EM_EXECUCAO'),
  ('PROGRAMADO', 'CANCELADO'),
  ('EM_EXECUCAO', 'AGUARDANDO_EVIDENCIAS'),
  ('EM_EXECUCAO', 'CANCELADO'),
  ('AGUARDANDO_EVIDENCIAS', 'AGUARDANDO_APROVACAO'),
  ('AGUARDANDO_EVIDENCIAS', 'CANCELADO'),
  ('AGUARDANDO_APROVACAO', 'CONCLUIDO'),
  ('AGUARDANDO_APROVACAO', 'REPROVADO'),
  ('AGUARDANDO_APROVACAO', 'CANCELADO'),
  ('REPROVADO', 'EM_EXECUCAO'),
  ('REPROVADO', 'CANCELADO');

alter table public.avu_status_transitions enable row level security;

create policy "avu_status_transitions are readable by authenticated users"
  on public.avu_status_transitions for select
  to authenticated
  using (true);

create or replace function public.is_valid_avu_transition(p_from public.avu_status, p_to public.avu_status)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.avu_status_transitions
    where from_status = p_from and to_status = p_to
  );
$$;

-- ---------------------------------------------------------------------------
-- avu_status_history — histórico rico (ator, data, de/para, comentário)
-- ---------------------------------------------------------------------------
create table public.avu_status_history (
  id uuid primary key default gen_random_uuid(),
  avu_id uuid not null references public.avus (id) on delete cascade,
  changed_by uuid references public.profiles (id) on delete set null,
  previous_status public.avu_status,
  new_status public.avu_status not null,
  comment text,
  created_at timestamptz not null default now()
);

comment on table public.avu_status_history is 'Histórico de transições de status da AVU, com comentário — fonte da timeline de fluxo.';

create index avu_status_history_avu_id_idx on public.avu_status_history (avu_id);

alter table public.avu_status_history enable row level security;

create policy "avu_status_history are readable per avu visibility"
  on public.avu_status_history for select
  to authenticated
  using (public.can_view_avu(avu_id));

-- Sem policy de insert/update/delete para o client — só o trigger abaixo
-- (security definer) escreve, mantendo o histórico à prova de adulteração.

-- ---------------------------------------------------------------------------
-- Validação de transição (before update) — vale para RPC e para UPDATE direto
-- ---------------------------------------------------------------------------
create or replace function public.validate_avu_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not public.is_admin() and not public.is_valid_avu_transition(old.status, new.status) then
      raise exception 'Transição de status inválida: % → %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger avus_validate_status_transition
  before update on public.avus
  for each row execute function public.validate_avu_status_transition();

-- ---------------------------------------------------------------------------
-- Registro automático em avu_status_history (after update)
-- ---------------------------------------------------------------------------
create or replace function public.record_avu_status_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_comment text;
begin
  if new.status is distinct from old.status then
    v_comment := nullif(current_setting('avu.transition_comment', true), '');
    insert into public.avu_status_history (avu_id, changed_by, previous_status, new_status, comment)
    values (new.id, auth.uid(), old.status, new.status, v_comment);
    perform set_config('avu.transition_comment', '', true);
  end if;
  return new;
end;
$$;

create trigger avus_record_status_history
  after update on public.avus
  for each row execute function public.record_avu_status_history();

-- audit_avus_change (Sprint 2) não loga mais status_changed em audit_logs —
-- isso agora é responsabilidade de avu_status_history (com comentário e tipagem melhor).
create or replace function public.audit_avus_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    return new;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'avu.updated', 'avus', new.id, null);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC genérica de transição (ação de planejamento) — nunca para as transições
-- já reservadas às RPCs de Fiscal/Contratada, exceto para admin.
-- ---------------------------------------------------------------------------
create or replace function public.avu_transition_status(p_avu_id uuid, p_new_status public.avu_status, p_comment text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    if p_new_status in ('AGUARDANDO_APROVACAO', 'CONCLUIDO', 'REPROVADO') then
      raise exception 'Use avu_submit_evidence/avu_review_execution para esta transição' using errcode = 'insufficient_privilege';
    end if;

    if not (public.has_permission('avus.create') or (public.has_role('planejamento') and public.has_permission('planning.manage'))) then
      raise exception 'Você não tem permissão para alterar o status desta AVU' using errcode = 'insufficient_privilege';
    end if;
  end if;

  perform set_config('avu.transition_comment', coalesce(p_comment, ''), true);
  update public.avus set status = p_new_status where id = p_avu_id;

  if not found then
    raise exception 'AVU não encontrada' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- avu_submit_evidence / avu_review_execution (Sprint 2) — passam o comentário
-- para avu_status_history via o mesmo GUC, e não duplicam mais em audit_logs
-- (a transição em si já fica registrada, com comentário, em avu_status_history).
-- ---------------------------------------------------------------------------
create or replace function public.avu_submit_evidence(p_avu_id uuid, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_avu public.avus%rowtype;
  v_company text;
begin
  select * into v_avu from public.avus where id = p_avu_id;
  if v_avu.id is null then
    raise exception 'AVU não encontrada' using errcode = 'no_data_found';
  end if;

  if not public.has_role('contratada') then
    raise exception 'Apenas contratadas podem enviar evidências' using errcode = 'insufficient_privilege';
  end if;

  select company_name into v_company from public.profiles where id = auth.uid();

  if v_company is null or v_avu.empresa_executante is null
     or lower(trim(v_company)) <> lower(trim(v_avu.empresa_executante)) then
    raise exception 'Você só pode enviar evidências de AVUs atribuídas à sua empresa' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('avu.transition_comment', coalesce(p_note, ''), true);
  update public.avus set status = 'AGUARDANDO_APROVACAO' where id = p_avu_id;
end;
$$;

create or replace function public.avu_review_execution(p_avu_id uuid, p_approved boolean, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_avu public.avus%rowtype;
  v_new_status public.avu_status;
begin
  select * into v_avu from public.avus where id = p_avu_id;
  if v_avu.id is null then
    raise exception 'AVU não encontrada' using errcode = 'no_data_found';
  end if;

  if not (public.is_admin() or (public.has_role('fiscal') and v_avu.fiscal = auth.uid())) then
    raise exception 'Apenas o fiscal responsável pode aprovar/reprovar esta AVU' using errcode = 'insufficient_privilege';
  end if;

  v_new_status := case when p_approved then 'CONCLUIDO' else 'REPROVADO' end;

  perform set_config('avu.transition_comment', coalesce(p_note, ''), true);
  update public.avus set status = v_new_status where id = p_avu_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- avu_planning_view — avus + status_since, sem N+1 queries no Kanban/Tabela.
-- security_invoker garante que a RLS de avus/avu_status_history é aplicada
-- para quem consulta a view, não para o dono da view.
-- ---------------------------------------------------------------------------
create view public.avu_planning_view
with (security_invoker = true)
as
select
  a.*,
  coalesce(latest.created_at, a.created_at) as status_since
from public.avus a
left join lateral (
  select h.created_at
  from public.avu_status_history h
  where h.avu_id = a.id
  order by h.created_at desc
  limit 1
) latest on true;

comment on view public.avu_planning_view is 'avus + status_since (data da última transição) — usada pelo Kanban/Tabela de Planejamento.';
