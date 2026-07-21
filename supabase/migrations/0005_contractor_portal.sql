-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0005: Portal da Contratada — envio real de evidências (fotos/vídeos/
-- documentos, com GPS/equipe/equipamentos), distinto do anexo genérico de
-- Documentos/Fotos (avu_attachments, Sprint 2), e correção da RLS de audit_logs
-- para que a timeline seja visível por qualquer um que enxergue a AVU.

-- ---------------------------------------------------------------------------
-- avu_evidences (evidências formais da Contratada, amarradas à aprovação)
-- ---------------------------------------------------------------------------
create type public.avu_evidence_tipo as enum ('foto', 'video', 'documento');

create table public.avu_evidences (
  id uuid primary key default gen_random_uuid(),
  avu_id uuid not null references public.avus (id) on delete cascade,
  tipo public.avu_evidence_tipo not null,
  arquivo text not null,
  nome_arquivo text not null,
  mime_type text,
  tamanho_bytes bigint,
  descricao text,
  data_upload timestamptz not null default now(),
  usuario uuid references public.profiles (id) on delete set null,
  latitude numeric,
  longitude numeric,
  data_execucao date,
  equipe text,
  equipamentos text
);

comment on table public.avu_evidences is 'Evidências formais enviadas pela Contratada (fotos/vídeos/documentos) para aprovação do Fiscal — distinto de avu_attachments (Documentos/Fotos genéricos, Sprint 2). O binário vive no bucket avu-evidences.';

create index avu_evidences_avu_id_idx on public.avu_evidences (avu_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avu-evidences',
  'avu-evidences',
  false,
  104857600, -- 100MB, para acomodar vídeo
  array[
    'image/*',
    'video/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS — insert restrito à própria Contratada (ou admin), não a qualquer editor
-- (diferente de avu_attachments, que usa can_write_avu_related mais amplo).
-- ---------------------------------------------------------------------------
alter table public.avu_evidences enable row level security;

create policy "avu_evidences are readable per avu visibility"
  on public.avu_evidences for select
  to authenticated
  using (public.can_view_avu(avu_id));

create policy "avu_evidences are insertable by the assigned contractor or admin"
  on public.avu_evidences for insert
  to authenticated
  with check (
    usuario = auth.uid()
    and (
      public.is_admin()
      or (public.has_role('contratada') and public.can_view_avu(avu_id))
    )
  );

create policy "avu_evidences are deletable by uploader or admin"
  on public.avu_evidences for delete
  to authenticated
  using (usuario = auth.uid() or public.is_admin());

-- Storage: convenção "avus/{avu_id}/evidences/{uuid}-{nome}" — o avu_id é o
-- segundo segmento do path (o primeiro é o literal "avus").
create policy "avu evidences storage select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avu-evidences'
    and public.can_view_avu(((storage.foldername(name))[2])::uuid)
  );

create policy "avu evidences storage insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avu-evidences'
    and (
      public.is_admin()
      or (public.has_role('contratada') and public.can_view_avu(((storage.foldername(name))[2])::uuid))
    )
  );

create policy "avu evidences storage delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avu-evidences'
    and (public.is_admin() or owner = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Correção no grafo de transições (Sprint 3): EM_EXECUCAO → AGUARDANDO_APROVACAO
-- nunca tinha sido adicionada, mas o frontend sempre permitiu a Contratada enviar
-- evidência a partir de EM_EXECUCAO (não só de AGUARDANDO_EVIDENCIAS) — sem esta
-- transição, avu_submit_evidence falhava no trigger de validação nesse caso.
-- ---------------------------------------------------------------------------
insert into public.avu_status_transitions (from_status, to_status)
values ('EM_EXECUCAO', 'AGUARDANDO_APROVACAO')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- avu_submit_evidence (Sprint 2/3) passa a exigir ao menos uma evidência
-- anexada antes de permitir a transição para AGUARDANDO_APROVACAO.
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

  if not exists (select 1 from public.avu_evidences where avu_id = p_avu_id) then
    raise exception 'Envie ao menos uma evidência (foto, vídeo ou documento) antes de submeter para aprovação' using errcode = 'check_violation';
  end if;

  perform set_config('avu.transition_comment', coalesce(p_note, ''), true);
  update public.avus set status = 'AGUARDANDO_APROVACAO' where id = p_avu_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- audit_logs — a policy de Sprint 1 só deixava ver eventos do próprio ator
-- (ou admin/history.view), então a timeline da AVU ficava incompleta para
-- quem não gerou o evento (Contratada/Fiscal/Gestor não viam "AVU criada"/
-- "Dados atualizados" feitos por outra pessoa). Passa a valer também para
-- quem pode ver a AVU do evento.
-- ---------------------------------------------------------------------------
drop policy "audit logs are readable by owner, admin or history.view" on public.audit_logs;

create policy "audit logs are readable by owner, admin, history.view, or avu visibility"
  on public.audit_logs for select
  to authenticated
  using (
    actor_id = auth.uid()
    or public.is_admin()
    or public.has_permission('history.view')
    or (entity = 'avus' and entity_id is not null and public.can_view_avu(entity_id))
  );
