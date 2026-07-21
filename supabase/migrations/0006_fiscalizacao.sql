-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0006: módulo de Fiscalização — decisão do Fiscal sobre evidências
-- (aprovar/reprovar/solicitar complementação), auditoria dedicada (avu_approvals)
-- e notificações (contratada/planejamento/segurança empresarial).

-- ---------------------------------------------------------------------------
-- Novas transições — reprovar manda direto para EM_EXECUCAO (não mais para
-- REPROVADO, que fica só como valor histórico do enum) e "solicitar
-- complementação" manda para AGUARDANDO_EVIDENCIAS.
-- ---------------------------------------------------------------------------
insert into public.avu_status_transitions (from_status, to_status) values
  ('AGUARDANDO_APROVACAO', 'EM_EXECUCAO'),
  ('AGUARDANDO_APROVACAO', 'AGUARDANDO_EVIDENCIAS')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- avu_approvals — auditoria dedicada das decisões do Fiscal
-- ---------------------------------------------------------------------------
create type public.avu_approval_decision as enum ('aprovado', 'reprovado', 'complementacao');

create table public.avu_approvals (
  id uuid primary key default gen_random_uuid(),
  avu_id uuid not null references public.avus (id) on delete cascade,
  fiscal_id uuid references public.profiles (id) on delete set null,
  decision public.avu_approval_decision not null,
  comment text,
  created_at timestamptz not null default now()
);

comment on table public.avu_approvals is 'Decisões do Fiscal sobre evidências (aprovar/reprovar/solicitar complementação) — auditoria dedicada, distinta de avu_status_history.';

create index avu_approvals_avu_id_idx on public.avu_approvals (avu_id);

alter table public.avu_approvals enable row level security;

create policy "avu_approvals are readable per avu visibility"
  on public.avu_approvals for select
  to authenticated
  using (public.can_view_avu(avu_id));

-- ---------------------------------------------------------------------------
-- notifications — uma linha por destinatário, sem modelo de assinatura
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  entity text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Notificações in-app, uma linha por destinatário. Só RPCs security definer inserem.';

create index notifications_user_id_idx on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

create policy "notifications are readable by their recipient"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications are markable as read by their recipient"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- avu_transition_status — fecha a brecha: origem AGUARDANDO_APROVACAO com
-- destino EM_EXECUCAO/AGUARDANDO_EVIDENCIAS também é reservado ao Fiscal.
-- ---------------------------------------------------------------------------
create or replace function public.avu_transition_status(p_avu_id uuid, p_new_status public.avu_status, p_comment text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_current_status public.avu_status;
begin
  select status into v_current_status from public.avus where id = p_avu_id;
  if v_current_status is null then
    raise exception 'AVU não encontrada' using errcode = 'no_data_found';
  end if;

  if not public.is_admin() then
    if p_new_status in ('AGUARDANDO_APROVACAO', 'CONCLUIDO', 'REPROVADO') then
      raise exception 'Use avu_submit_evidence/avu_review_evidence para esta transição' using errcode = 'insufficient_privilege';
    end if;

    if v_current_status = 'AGUARDANDO_APROVACAO' and p_new_status in ('EM_EXECUCAO', 'AGUARDANDO_EVIDENCIAS') then
      raise exception 'Use avu_review_evidence para esta transição' using errcode = 'insufficient_privilege';
    end if;

    if not (public.has_permission('avus.create') or (public.has_role('planejamento') and public.has_permission('planning.manage'))) then
      raise exception 'Você não tem permissão para alterar o status desta AVU' using errcode = 'insufficient_privilege';
    end if;
  end if;

  perform set_config('avu.transition_comment', coalesce(p_comment, ''), true);
  update public.avus set status = p_new_status where id = p_avu_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- avu_review_evidence — substitui avu_review_execution (Sprint 2). Grava a
-- decisão em avu_approvals, transiciona o status (aprovado→CONCLUIDO,
-- reprovado→EM_EXECUCAO, complementacao→AGUARDANDO_EVIDENCIAS) e notifica
-- a Contratada + Planejamento + Segurança Empresarial.
-- ---------------------------------------------------------------------------
create or replace function public.avu_review_evidence(p_avu_id uuid, p_decision public.avu_approval_decision, p_comment text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_avu public.avus%rowtype;
  v_new_status public.avu_status;
  v_title text;
  v_body text;
begin
  select * into v_avu from public.avus where id = p_avu_id;
  if v_avu.id is null then
    raise exception 'AVU não encontrada' using errcode = 'no_data_found';
  end if;

  -- `v_avu.fiscal = auth.uid()` seria NULL (não false) quando fiscal is null, e em
  -- PL/pgSQL um `if not (... or null)` vira `if not null` — que NÃO dispara o `raise`
  -- (lógica de três valores). `is not null` explícito evita esse bypass silencioso.
  if not (public.is_admin() or (public.has_role('fiscal') and v_avu.fiscal is not null and v_avu.fiscal = auth.uid())) then
    raise exception 'Apenas o fiscal responsável pode analisar esta AVU' using errcode = 'insufficient_privilege';
  end if;

  if v_avu.status <> 'AGUARDANDO_APROVACAO' then
    raise exception 'Esta AVU não está aguardando aprovação' using errcode = 'check_violation';
  end if;

  v_new_status := case p_decision
    when 'aprovado' then 'CONCLUIDO'
    when 'reprovado' then 'EM_EXECUCAO'
    when 'complementacao' then 'AGUARDANDO_EVIDENCIAS'
  end;

  v_title := case p_decision
    when 'aprovado' then 'AVU aprovada'
    when 'reprovado' then 'AVU reprovada'
    when 'complementacao' then 'Complementação de evidências solicitada'
  end;

  v_body := case p_decision
    when 'aprovado' then format('A AVU %s foi aprovada pelo fiscal.', v_avu.numero_avu)
    when 'reprovado' then format('A AVU %s foi reprovada e retornou para execução.', v_avu.numero_avu)
    when 'complementacao' then format('A AVU %s precisa de evidências complementares.', v_avu.numero_avu)
  end;

  insert into public.avu_approvals (avu_id, fiscal_id, decision, comment)
  values (p_avu_id, auth.uid(), p_decision, p_comment);

  perform set_config('avu.transition_comment', coalesce(p_comment, ''), true);
  update public.avus set status = v_new_status where id = p_avu_id;

  insert into public.notifications (user_id, title, body, entity, entity_id)
  select p.id, v_title, v_body, 'avus', p_avu_id
  from public.profiles p
  where p.id <> auth.uid()
    and (
      (v_avu.empresa_executante is not null and p.company_name is not null
        and lower(trim(p.company_name)) = lower(trim(v_avu.empresa_executante)))
      or exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = p.id and r.name in ('planejamento', 'seguranca_empresarial')
      )
    );
end;
$$;

drop function if exists public.avu_review_execution(uuid, boolean, text);

-- ---------------------------------------------------------------------------
-- avu_fiscalizacao_view — avus + última decisão registrada em avu_approvals.
-- "Reprovados" não pode ser um filtro de status (reprovar manda pra
-- EM_EXECUCAO), então a página de Fiscalização usa latest_decision.
-- ---------------------------------------------------------------------------
create view public.avu_fiscalizacao_view
with (security_invoker = true)
as
select
  a.*,
  latest.decision as latest_decision,
  latest.comment as latest_decision_comment,
  latest.created_at as latest_decision_at,
  latest.fiscal_id as latest_decision_fiscal_id
from public.avus a
left join lateral (
  select ap.decision, ap.comment, ap.created_at, ap.fiscal_id
  from public.avu_approvals ap
  where ap.avu_id = a.id
  order by ap.created_at desc
  limit 1
) latest on true;

comment on view public.avu_fiscalizacao_view is 'avus + última decisão de avu_approvals — usada pela página de Fiscalização para o bucket "Reprovados", que não corresponde a nenhum status ao vivo.';
