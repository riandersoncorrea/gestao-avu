-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0003: núcleo do sistema — tabela avus, comentários, anexos (Storage),
-- funções de visibilidade por perfil, RPCs de ações sensíveis e auditoria automática.

-- ---------------------------------------------------------------------------
-- profiles: campos usados para escopo por linha (Contratada por empresa, Gestor por área)
-- ---------------------------------------------------------------------------
alter table public.profiles add column company_name text;
alter table public.profiles add column area text;

comment on column public.profiles.company_name is 'Empresa da contratada — usado para filtrar avus.empresa_executante (avus.view_assigned).';
comment on column public.profiles.area is 'Área/gerência do gestor — usado para filtrar avus.gerencia_responsavel (avus.view_area).';

-- ---------------------------------------------------------------------------
-- avus
-- ---------------------------------------------------------------------------
create type public.avu_status as enum (
  'NOVO',
  'TRIAGEM',
  'PLANEJAMENTO',
  'PROGRAMADO',
  'EM_EXECUCAO',
  'AGUARDANDO_EVIDENCIAS',
  'AGUARDANDO_APROVACAO',
  'CONCLUIDO',
  'REPROVADO',
  'CANCELADO'
);

create sequence public.avus_numero_seq;

create table public.avus (
  id uuid primary key default gen_random_uuid(),
  numero_avu text unique,
  data_criacao date not null default current_date,
  gerencia_responsavel text,
  data_limite date,
  emitente uuid references public.profiles (id) on delete set null,
  projeto text,
  local text,
  latitude numeric,
  longitude numeric,
  descricao text not null,
  categoria text,
  subcategoria text,
  nivel_confianca_ia numeric check (nivel_confianca_ia is null or (nivel_confianca_ia between 0 and 100)),
  status public.avu_status not null default 'NOVO',
  responsavel uuid references public.profiles (id) on delete set null,
  empresa_executante text,
  fiscal uuid references public.profiles (id) on delete set null,
  nota_sap text,
  ordem_manutencao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.avus is 'Análises de Vulnerabilidades — núcleo do sistema.';

create index avus_status_idx on public.avus (status);
create index avus_fiscal_idx on public.avus (fiscal);
create index avus_responsavel_idx on public.avus (responsavel);
create index avus_data_limite_idx on public.avus (data_limite);

create trigger avus_set_updated_at
  before update on public.avus
  for each row execute function public.set_updated_at();

-- Gera o número legível (AVU-<ano>-<sequência>) quando não informado.
create or replace function public.set_avu_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero_avu is null then
    new.numero_avu := 'AVU-' || extract(year from now())::text || '-' ||
      lpad(nextval('public.avus_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger avus_set_numero
  before insert on public.avus
  for each row execute function public.set_avu_numero();

-- ---------------------------------------------------------------------------
-- avu_comments
-- ---------------------------------------------------------------------------
create table public.avu_comments (
  id uuid primary key default gen_random_uuid(),
  avu_id uuid not null references public.avus (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

comment on table public.avu_comments is 'Comentários da aba "Comentários" no detalhe da AVU.';

create index avu_comments_avu_id_idx on public.avu_comments (avu_id);

-- ---------------------------------------------------------------------------
-- avu_attachments (Documentos e Fotos — arquivos reais no Storage)
-- ---------------------------------------------------------------------------
create table public.avu_attachments (
  id uuid primary key default gen_random_uuid(),
  avu_id uuid not null references public.avus (id) on delete cascade,
  kind text not null check (kind in ('document', 'photo')),
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.avu_attachments is 'Metadados dos arquivos das abas "Documentos"/"Fotos" — o binário vive no bucket avu-attachments.';

create index avu_attachments_avu_id_idx on public.avu_attachments (avu_id);

insert into storage.buckets (id, name, public)
values ('avu-attachments', 'avu-attachments', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Funções de visibilidade por perfil (mesma família de is_admin()/has_permission())
-- ---------------------------------------------------------------------------
create or replace function public.can_view_avu(p_avu_id uuid)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_avu public.avus%rowtype;
begin
  if public.is_admin() then
    return true;
  end if;

  select * into v_avu from public.avus where id = p_avu_id;
  if v_avu.id is null then
    return false;
  end if;

  if public.has_permission('avus.view_all') or public.has_permission('readonly.view') then
    return true;
  end if;

  if public.has_role('fiscal') and v_avu.fiscal = auth.uid() then
    return true;
  end if;

  if public.has_role('contratada') and v_avu.empresa_executante is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_name is not null
      and lower(trim(p.company_name)) = lower(trim(v_avu.empresa_executante))
  ) then
    return true;
  end if;

  if public.has_role('gestor') and v_avu.gerencia_responsavel is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.area is not null
      and lower(trim(p.area)) = lower(trim(v_avu.gerencia_responsavel))
  ) then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.can_view_avu(uuid) is 'Visibilidade por linha de uma AVU, conforme o(s) perfil(is) do usuário atual.';

create or replace function public.can_write_avu_related(p_avu_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.can_view_avu(p_avu_id) and (
    public.is_admin()
    or public.has_permission('avus.view_all')
    or public.has_permission('avus.view_assigned')
    or public.has_permission('avus.view_area')
  );
$$;

comment on function public.can_write_avu_related(uuid) is 'Como can_view_avu(), mas exclui quem só tem readonly.view (Leitor não comenta nem anexa arquivos).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.avus enable row level security;
alter table public.avu_comments enable row level security;
alter table public.avu_attachments enable row level security;

create policy "avus are readable per can_view_avu"
  on public.avus for select
  to authenticated
  using (public.can_view_avu(id));

create policy "avus are insertable by creators"
  on public.avus for insert
  to authenticated
  with check (public.is_admin() or public.has_permission('avus.create'));

create policy "avus are updatable by editors"
  on public.avus for update
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('avus.create')
    or (public.has_role('planejamento') and public.has_permission('planning.manage'))
  )
  with check (
    public.is_admin()
    or public.has_permission('avus.create')
    or (public.has_role('planejamento') and public.has_permission('planning.manage'))
  );

create policy "avus are deletable by admins"
  on public.avus for delete
  to authenticated
  using (public.is_admin());

create policy "avu_comments are readable per avu visibility"
  on public.avu_comments for select
  to authenticated
  using (public.can_view_avu(avu_id));

create policy "avu_comments are insertable by non-readonly viewers"
  on public.avu_comments for insert
  to authenticated
  with check (public.can_write_avu_related(avu_id) and author_id = auth.uid());

create policy "avu_comments are deletable by author or admin"
  on public.avu_comments for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "avu_attachments are readable per avu visibility"
  on public.avu_attachments for select
  to authenticated
  using (public.can_view_avu(avu_id));

create policy "avu_attachments are insertable by non-readonly viewers"
  on public.avu_attachments for insert
  to authenticated
  with check (public.can_write_avu_related(avu_id) and uploaded_by = auth.uid());

create policy "avu_attachments are deletable by uploader or admin"
  on public.avu_attachments for delete
  to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

-- Storage: mesmo predicado de visibilidade, usando o primeiro segmento do path
-- do objeto (convenção "<avu_id>/<uuid>-<nome-original>") como avu_id.
create policy "avu attachments storage select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avu-attachments'
    and public.can_view_avu(((storage.foldername(name))[1])::uuid)
  );

create policy "avu attachments storage insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avu-attachments'
    and public.can_write_avu_related(((storage.foldername(name))[1])::uuid)
  );

create policy "avu attachments storage delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avu-attachments'
    and (
      public.is_admin()
      or owner = auth.uid()
      or public.can_write_avu_related(((storage.foldername(name))[1])::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs de ações sensíveis (security definer — nunca só no frontend)
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

  update public.avus set status = 'AGUARDANDO_APROVACAO' where id = p_avu_id;

  if p_note is not null then
    insert into public.avu_comments (avu_id, author_id, body) values (p_avu_id, auth.uid(), p_note);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'avu.evidence_submitted', 'avus', p_avu_id, null);
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
  update public.avus set status = v_new_status where id = p_avu_id;

  if p_note is not null then
    insert into public.avu_comments (avu_id, author_id, body) values (p_avu_id, auth.uid(), p_note);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when p_approved then 'avu.approved' else 'avu.rejected' end, 'avus', p_avu_id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Auditoria automática (mesmo padrão de user_roles_audit da Sprint 1)
-- ---------------------------------------------------------------------------
create or replace function public.audit_avus_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'avu.created', 'avus', new.id, jsonb_build_object('numero_avu', new.numero_avu));
  return new;
end;
$$;

create trigger avus_audit_insert
  after insert on public.avus
  for each row execute function public.audit_avus_insert();

create or replace function public.audit_avus_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'avu.status_changed', 'avus', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  else
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'avu.updated', 'avus', new.id, null);
  end if;
  return new;
end;
$$;

create trigger avus_audit_update
  after update on public.avus
  for each row execute function public.audit_avus_change();
