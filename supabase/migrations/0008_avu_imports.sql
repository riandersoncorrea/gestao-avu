-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0008: Importação inteligente de PDFs — fila de processamento
-- (avu_imports/avu_import_logs), bucket de staging pré-confirmação, e as
-- RPCs que a Edge Function `process-avu-import` e a tela de revisão usam.
--
-- Decisão de arquitetura (ver docs/testing.md): a linha real em `avus` só é
-- criada quando o pipeline valida com confiança suficiente OU quando um
-- humano confirma na tela de revisão — nunca antes. Os arquivos ficam num
-- bucket de staging (`avu-import-staging/{import_id}/...`) até esse momento,
-- e só então são copiados para o bucket/tabela `avu_attachments` já
-- existentes (kind='document' pro PDF, kind='photo' por imagem extraída) —
-- a cópia de bytes entre buckets não é possível em SQL puro, por isso é
-- feita pela Edge Function (que tem acesso à API de Storage), não por RPC.

-- ---------------------------------------------------------------------------
-- avu_imports
-- ---------------------------------------------------------------------------
create type public.avu_import_status as enum (
  'AGUARDANDO',
  'PROCESSANDO',
  'PROCESSADO',
  'ERRO',
  'REVISAO_NECESSARIA'
);

create table public.avu_imports (
  id uuid primary key default gen_random_uuid(),
  avu_id uuid references public.avus (id) on delete cascade,
  status public.avu_import_status not null default 'AGUARDANDO',
  original_file_name text not null,
  staging_path text not null,
  extracted_fields jsonb,
  categoria_sugerida text,
  subcategoria_sugerida text,
  confianca numeric check (confianca is null or (confianca between 0 and 100)),
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.avu_imports is 'Fila de importação inteligente de PDFs — cada linha é um upload em processamento (OCR/extração/classificação) até virar uma AVU real (avu_id) ou precisar de revisão humana.';

create index avu_imports_avu_id_idx on public.avu_imports (avu_id);
create index avu_imports_status_idx on public.avu_imports (status);
create index avu_imports_created_by_idx on public.avu_imports (created_by);

create trigger avu_imports_set_updated_at
  before update on public.avu_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- avu_import_logs (logs do processamento, um por passo do pipeline)
-- ---------------------------------------------------------------------------
create table public.avu_import_logs (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.avu_imports (id) on delete cascade,
  step text not null, -- UPLOAD | OCR | EXTRACAO_TEXTO | EXTRACAO_CAMPOS | EXTRACAO_IMAGENS | CLASSIFICACAO_IA | VALIDACAO | CRIACAO_AVU
  status text not null check (status in ('INICIADO', 'SUCESSO', 'ERRO')),
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.avu_import_logs is 'Log passo-a-passo do pipeline de importação (uma linha por etapa), para auditoria/depuração na tela de revisão.';

create index avu_import_logs_import_id_idx on public.avu_import_logs (import_id);

-- ---------------------------------------------------------------------------
-- Bucket de staging — arquivo ainda não pertence a nenhuma AVU visível,
-- então a RLS de storage não pode usar can_view_avu() aqui; usa só o owner.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avu-import-staging', 'avu-import-staging', false, 20971520, array['application/pdf']) -- 20MB, só PDF
on conflict (id) do nothing;

alter table public.avu_imports enable row level security;
alter table public.avu_import_logs enable row level security;

-- Quem pode importar PDF = quem pode criar AVU diretamente (mesma régua de /avus/novo).
create policy "avu_imports are readable by importers"
  on public.avu_imports for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('avus.view_all')
    or public.has_permission('avus.create')
  );

create policy "avu_imports are insertable by importers"
  on public.avu_imports for insert
  to authenticated
  with check (
    (public.is_admin() or public.has_permission('avus.create'))
    and created_by = auth.uid()
  );

create policy "avu_imports are updatable by importers"
  on public.avu_imports for update
  to authenticated
  using (public.is_admin() or public.has_permission('avus.create'))
  with check (public.is_admin() or public.has_permission('avus.create'));

create policy "avu_import_logs are readable by importers"
  on public.avu_import_logs for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('avus.view_all')
    or public.has_permission('avus.create')
  );

create policy "avu_import_logs are insertable by importers"
  on public.avu_import_logs for insert
  to authenticated
  with check (public.is_admin() or public.has_permission('avus.create'));

-- Storage: convenção "{import_id}/original.pdf" — ainda não existe uma AVU
-- pra usar can_view_avu(), então quem pode mexer é a mesma população que
-- pode importar (não só o dono do upload — um colega com avus.create
-- também precisa poder reprocessar/inspecionar a importação de outro).
create policy "avu import staging storage select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avu-import-staging' and (public.is_admin() or public.has_permission('avus.create')));

create policy "avu import staging storage insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avu-import-staging'
    and (public.is_admin() or public.has_permission('avus.create'))
  );

create policy "avu import staging storage delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avu-import-staging' and (public.is_admin() or public.has_permission('avus.create')));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Cria a linha da fila. O id é gerado no cliente (mesmo padrão já usado em
-- avuService.ts/evidenceService.ts para nomear o arquivo no Storage antes de
-- ter uma linha no banco) para que o path de staging já possa ser montado
-- antes desta chamada.
create or replace function public.avu_import_start(p_import_id uuid, p_original_file_name text, p_staging_path text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if not (public.is_admin() or public.has_permission('avus.create')) then
    raise exception 'Você não tem permissão para importar AVUs' using errcode = 'insufficient_privilege';
  end if;

  insert into public.avu_imports (id, original_file_name, staging_path, created_by, status)
  values (p_import_id, p_original_file_name, p_staging_path, auth.uid(), 'AGUARDANDO');

  insert into public.avu_import_logs (import_id, step, status, message)
  values (p_import_id, 'UPLOAD', 'SUCESSO', 'Arquivo recebido: ' || p_original_file_name);

  return p_import_id;
end;
$$;

comment on function public.avu_import_start(uuid, text, text) is 'Registra um PDF recebido na fila de importação (status AGUARDANDO). Chamado pelo frontend logo após o upload pro bucket de staging.';

-- Reseta uma importação com erro pra reprocessar (usado pelo teste de falha
-- e pelo botão "Tentar novamente" na fila).
create or replace function public.avu_import_retry(p_import_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_import public.avu_imports%rowtype;
begin
  select * into v_import from public.avu_imports where id = p_import_id;
  if v_import.id is null then
    raise exception 'Importação não encontrada' using errcode = 'no_data_found';
  end if;

  if not (public.is_admin() or public.has_permission('avus.create')) then
    raise exception 'Você não tem permissão para reprocessar importações' using errcode = 'insufficient_privilege';
  end if;

  update public.avu_imports
  set status = 'AGUARDANDO', error_message = null
  where id = p_import_id;

  insert into public.avu_import_logs (import_id, step, status, message)
  values (p_import_id, 'UPLOAD', 'SUCESSO', 'Reprocessamento solicitado por ' || auth.uid()::text);
end;
$$;

comment on function public.avu_import_retry(uuid) is 'Reseta uma importação em ERRO de volta para AGUARDANDO, para a Edge Function reprocessar.';

-- Cria a AVU real a partir dos campos extraídos/editados. Só a parte de
-- banco — a cópia dos arquivos do bucket de staging para avu-attachments é
-- feita pela Edge Function (tem acesso à API de Storage; SQL puro não tem)
-- logo antes ou logo depois desta chamada, usando o avu_id retornado aqui.
create or replace function public.avu_import_confirm_create_avu(
  p_import_id uuid,
  p_fields jsonb,
  p_categoria text,
  p_subcategoria text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_import public.avu_imports%rowtype;
  v_avu_id uuid;
  v_descricao text;
begin
  select * into v_import from public.avu_imports where id = p_import_id;
  if v_import.id is null then
    raise exception 'Importação não encontrada' using errcode = 'no_data_found';
  end if;

  if not (public.is_admin() or public.has_permission('avus.create')) then
    raise exception 'Você não tem permissão para confirmar importações' using errcode = 'insufficient_privilege';
  end if;

  if v_import.avu_id is not null then
    raise exception 'Esta importação já criou uma AVU' using errcode = 'check_violation';
  end if;

  v_descricao := nullif(trim(p_fields ->> 'descricao'), '');
  if v_descricao is null then
    raise exception 'Descrição é obrigatória para confirmar a importação' using errcode = 'check_violation';
  end if;

  insert into public.avus (
    numero_avu, data_criacao, gerencia_responsavel, data_limite, emitente,
    projeto, local, latitude, longitude, descricao, categoria, subcategoria,
    nivel_confianca_ia
  )
  values (
    nullif(trim(p_fields ->> 'numeroAvu'), ''),
    coalesce((p_fields ->> 'dataCriacao')::date, current_date),
    nullif(trim(p_fields ->> 'gerenciaResponsavel'), ''),
    (p_fields ->> 'dataLimite')::date,
    (p_fields ->> 'emitenteId')::uuid,
    nullif(trim(p_fields ->> 'projeto'), ''),
    nullif(trim(p_fields ->> 'local'), ''),
    (p_fields ->> 'latitude')::numeric,
    (p_fields ->> 'longitude')::numeric,
    v_descricao,
    nullif(trim(p_categoria), ''),
    nullif(trim(p_subcategoria), ''),
    v_import.confianca
  )
  returning id into v_avu_id;

  update public.avu_imports
  set avu_id = v_avu_id, status = 'PROCESSADO', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_import_id;

  insert into public.avu_import_logs (import_id, step, status, message)
  values (p_import_id, 'CRIACAO_AVU', 'SUCESSO', 'AVU criada por ' || auth.uid()::text);

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'avu_import.confirm', 'avus', v_avu_id, jsonb_build_object('import_id', p_import_id));

  return v_avu_id;
end;
$$;

comment on function public.avu_import_confirm_create_avu(uuid, jsonb, text, text) is 'Cria a linha real em avus a partir de uma importação (automático quando a validação passa, ou disparado pelo humano na tela de revisão). Não mexe em Storage — isso é feito pela Edge Function.';
