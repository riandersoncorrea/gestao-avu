-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0002: RBAC completo (7 perfis), convites de cadastro e trilha de auditoria de papéis.
--
-- Substitui o modelo de "um papel por perfil" (profiles.role_id) da migration 0001 por
-- um modelo many-to-many via user_roles, e troca o seed de roles pelos 7 perfis do negócio.
--
-- Bootstrap: como user_roles nasce vazio, ninguém consegue criar convites (ação admin-only)
-- até existir um admin. handle_new_user() resolve isso: se ainda não existe NENHUMA linha em
-- user_roles no sistema inteiro, o primeiro usuário a se cadastrar vira admin automaticamente.
-- A partir do segundo cadastro em diante, a validação por convite passa a valer.
--
-- IMPORTANTE: crie a conta admin (primeiro cadastro em /cadastro) antes de divulgar a URL
-- de cadastro publicamente, ou qualquer pessoa que se cadastrar primeiro vira admin.

-- ---------------------------------------------------------------------------
-- profiles: is_active + remoção do role_id (substituído por user_roles)
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_active boolean not null default true;
alter table public.profiles drop column role_id;

-- ---------------------------------------------------------------------------
-- user_roles (many-to-many)
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

comment on table public.user_roles is 'Atribuição de perfis (roles) a usuários — many-to-many, um usuário pode ter mais de um perfil.';

-- ---------------------------------------------------------------------------
-- user_invites
-- ---------------------------------------------------------------------------
create table public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role_id uuid not null references public.roles (id) on delete restrict,
  invited_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.user_invites is 'Convites de cadastro: e-mail + perfil pré-atribuído. handle_new_user() só cria a conta se houver convite não usado para o e-mail (ou se for o bootstrap do primeiro admin).';

-- ---------------------------------------------------------------------------
-- Seed: substitui os 4 roles da Sprint 0 pelos 7 perfis do negócio
-- ---------------------------------------------------------------------------
delete from public.role_permissions;
delete from public.roles;

insert into public.roles (name, description) values
  ('admin', 'Administrador — acesso total ao sistema'),
  ('seguranca_empresarial', 'Segurança Empresarial — cria e visualiza AVUs, gerencia segurança, vê histórico'),
  ('planejamento', 'Planejamento — visualiza AVUs, gerencia planejamento, vê Notas e OMs'),
  ('fiscal', 'Fiscal — visualiza AVUs atribuídos, analisa evidências, aprova/reprova execução'),
  ('contratada', 'Contratada — visualiza AVUs atribuídos à empresa, envia evidências'),
  ('gestor', 'Gestor — visualiza indicadores e AVUs da sua área'),
  ('leitor', 'Leitor — somente leitura');

insert into public.permissions (key, description) values
  ('avus.view_all', 'Visualizar todas as AVUs'),
  ('avus.view_assigned', 'Visualizar AVUs atribuídas ao usuário/empresa'),
  ('avus.view_area', 'Visualizar AVUs da área do usuário'),
  ('avus.create', 'Criar AVUs'),
  ('security.manage', 'Gerenciar informações de segurança'),
  ('history.view', 'Visualizar histórico/auditoria completo'),
  ('planning.manage', 'Gerenciar planejamento'),
  ('noms.view', 'Visualizar Notas e OMs'),
  ('evidence.analyze', 'Analisar evidências de execução'),
  ('execution.approve', 'Aprovar ou reprovar execução'),
  ('evidence.submit', 'Enviar evidências de execução'),
  ('indicators.view', 'Visualizar indicadores'),
  ('readonly.view', 'Acesso de leitura geral ao sistema');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on
  (r.name = 'seguranca_empresarial' and p.key in ('avus.view_all', 'avus.create', 'security.manage', 'history.view'))
  or (r.name = 'planejamento' and p.key in ('avus.view_all', 'planning.manage', 'noms.view'))
  or (r.name = 'fiscal' and p.key in ('avus.view_assigned', 'evidence.analyze', 'execution.approve'))
  or (r.name = 'contratada' and p.key in ('avus.view_assigned', 'evidence.submit'))
  or (r.name = 'gestor' and p.key in ('indicators.view', 'avus.view_area'))
  or (r.name = 'leitor' and p.key in ('readonly.view'));

-- ---------------------------------------------------------------------------
-- Funções de autorização
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.name = 'admin'
  );
$$;

create or replace function public.has_role(role_slug text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.name = role_slug
  );
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid() and p.key = permission_key
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- handle_new_user(): bootstrap do primeiro admin + validação de convite
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.user_invites%rowtype;
  v_admin_role_id uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), new.email);

  if not exists (select 1 from public.user_roles limit 1) then
    -- Bootstrap: primeiro usuário do sistema vira admin.
    select id into v_admin_role_id from public.roles where name = 'admin';
    insert into public.user_roles (user_id, role_id) values (new.id, v_admin_role_id);
    return new;
  end if;

  select * into v_invite from public.user_invites where email = new.email and used_at is null;

  if v_invite.id is null then
    raise exception 'Cadastro não autorizado: nenhum convite pendente para o e-mail %', new.email
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.user_roles (user_id, role_id) values (new.id, v_invite.role_id);
  update public.user_invites set used_at = now() where id = v_invite.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auditoria automática de mudanças em user_roles
-- ---------------------------------------------------------------------------
create or replace function public.audit_user_roles_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'user_role.assigned', 'user_roles', new.user_id, jsonb_build_object('role_id', new.role_id));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'user_role.removed', 'user_roles', old.user_id, jsonb_build_object('role_id', old.role_id));
    return old;
  end if;
  return null;
end;
$$;

create trigger user_roles_audit
  after insert or delete on public.user_roles
  for each row execute function public.audit_user_roles_change();

-- ---------------------------------------------------------------------------
-- RPCs administrativas (security definer, checam is_admin() internamente —
-- nunca confiar no frontend: mesmo que alguém chame a RPC direto, é bloqueada aqui).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_roles(target_user_id uuid, role_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar perfis de usuário' using errcode = 'insufficient_privilege';
  end if;

  delete from public.user_roles where user_id = target_user_id;

  insert into public.user_roles (user_id, role_id)
  select target_user_id, unnest(role_ids);
end;
$$;

create or replace function public.admin_set_user_active(target_user_id uuid, active boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem ativar/desativar usuários' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set is_active = active where id = target_user_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when active then 'user.activated' else 'user.deactivated' end, 'profiles', target_user_id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.user_roles enable row level security;
alter table public.user_invites enable row level security;

create policy "user_roles are readable by owner or admin"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Sem policy de insert/update/delete para o client: a escrita acontece só via
-- handle_new_user() (trigger, security definer) ou admin_set_user_roles() (RPC, security definer),
-- ambas bypassam RLS por serem SECURITY DEFINER — exatamente por isso não expomos INSERT/DELETE
-- diretos aqui, fechando a única porta de escrita no caminho auditado.

create policy "user_invites are readable by admins"
  on public.user_invites for select
  to authenticated
  using (public.is_admin());

create policy "user_invites are writable by admins"
  on public.user_invites for insert
  to authenticated
  with check (public.is_admin());

create policy "user_invites are deletable by admins"
  on public.user_invites for delete
  to authenticated
  using (public.is_admin());

-- audit_logs: Segurança Empresarial (history.view) também enxerga tudo, além do próprio ator/admin.
drop policy "users can read their own audit logs" on public.audit_logs;

create policy "audit logs are readable by owner, admin or history.view"
  on public.audit_logs for select
  to authenticated
  using (actor_id = auth.uid() or public.is_admin() or public.has_permission('history.view'));
