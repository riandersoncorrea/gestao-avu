-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0001: estrutura inicial (profiles, roles, permissions, audit_logs)
-- Escopo desta sprint: apenas fundação de identidade/acesso e trilha de auditoria.
-- Tabelas de negócio (avus, planning, contractors, inspections, ...) ficam para as próximas sprints.

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.roles is 'Papéis de acesso (ex.: admin, fiscal, planejador, contratada).';

insert into public.roles (name, description) values
  ('admin', 'Acesso total ao sistema'),
  ('fiscal', 'Fiscalização de contratos e execução em campo'),
  ('planejador', 'Planejamento e priorização de AVUs'),
  ('contratada', 'Execução de serviços — acesso restrito ao próprio escopo');

-- ---------------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- ex.: 'avus.create', 'reports.export'
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is 'Permissões granulares, referenciadas por chave (ex.: "avus.create").';

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- profiles (1:1 com auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role_id uuid references public.roles (id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Dados de perfil do usuário autenticado, espelhando auth.users.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria profile automaticamente quando um usuário se cadastra via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null, -- ex.: 'avu.create', 'avu.status_change'
  entity text not null, -- ex.: 'avu', 'profile'
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Trilha de auditoria de ações relevantes do sistema.';

create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Helper: usuário atual é admin?
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.name = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

-- roles / permissions / role_permissions: dados de referência, leitura para
-- qualquer usuário autenticado; escrita restrita a admins.
create policy "roles are readable by authenticated users"
  on public.roles for select
  to authenticated
  using (true);

create policy "roles are writable by admins"
  on public.roles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "permissions are readable by authenticated users"
  on public.permissions for select
  to authenticated
  using (true);

create policy "permissions are writable by admins"
  on public.permissions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "role_permissions are readable by authenticated users"
  on public.role_permissions for select
  to authenticated
  using (true);

create policy "role_permissions are writable by admins"
  on public.role_permissions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- profiles: qualquer usuário autenticado pode ver o diretório (nome/avatar
-- necessários para atribuir AVUs); só o próprio usuário (ou admin) edita.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "admins can insert profiles"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

-- audit_logs: cada usuário vê os próprios eventos; admins veem tudo.
-- Inserção é feita via service role (funções/triggers), não diretamente pelo cliente.
create policy "users can read their own audit logs"
  on public.audit_logs for select
  to authenticated
  using (actor_id = auth.uid() or public.is_admin());
