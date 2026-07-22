-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0009: Integração SAP — importação de arquivos exportados (CSV/XLSX),
-- não conexão direta com o SAP (fora de escopo desta sprint). Relaciona cada
-- registro a uma AVU existente via número extraído da descrição por regex
-- configurável, atualiza nota_sap/ordem_manutencao quando encontra, e marca
-- AVU_NAO_ENCONTRADO/DUPLICADO/ERRO quando não consegue.

-- ---------------------------------------------------------------------------
-- sap_imports (histórico de importações)
-- ---------------------------------------------------------------------------
create type public.sap_import_status as enum ('PROCESSANDO', 'PROCESSADO', 'ERRO');

create table public.sap_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null check (file_type in ('csv', 'xlsx')),
  regex_pattern text not null,
  status public.sap_import_status not null default 'PROCESSANDO',
  total_records integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sap_imports is 'Histórico de importações de arquivos exportados do SAP (CSV/XLSX) — cada linha é um upload processado em lote.';

create index sap_imports_created_by_idx on public.sap_imports (created_by);

create trigger sap_imports_set_updated_at
  before update on public.sap_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sap_records (uma linha do arquivo importado)
-- ---------------------------------------------------------------------------
create type public.sap_record_match_status as enum ('RELACIONADO', 'AVU_NAO_ENCONTRADO', 'DUPLICADO', 'ERRO');

create table public.sap_records (
  id uuid primary key default gen_random_uuid(),
  sap_import_id uuid not null references public.sap_imports (id) on delete cascade,
  nota text,
  om text,
  status_sap text,
  centro text,
  data_planejada date,
  data_execucao date,
  prioridade_sap text,
  descricao text,
  avu_numero_extraido text,
  avu_id uuid references public.avus (id) on delete set null,
  match_status public.sap_record_match_status not null,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.sap_records is 'Uma linha do arquivo SAP importado — status_sap/prioridade_sap/datas são texto/valores brutos do SAP, não confundir com os campos internos de avus (o workflow interno não é sobrescrito por esta importação).';

create index sap_records_sap_import_id_idx on public.sap_records (sap_import_id);
create index sap_records_nota_idx on public.sap_records (nota);
create index sap_records_avu_id_idx on public.sap_records (avu_id);

-- ---------------------------------------------------------------------------
-- RLS — mesma régua de avu_imports (quem pode importar = quem pode criar AVU)
-- ---------------------------------------------------------------------------
alter table public.sap_imports enable row level security;
alter table public.sap_records enable row level security;

create policy "sap_imports are readable by importers"
  on public.sap_imports for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('avus.view_all')
    or public.has_permission('avus.create')
  );

create policy "sap_imports are insertable by importers"
  on public.sap_imports for insert
  to authenticated
  with check (
    (public.is_admin() or public.has_permission('avus.create'))
    and created_by = auth.uid()
  );

create policy "sap_imports are updatable by importers"
  on public.sap_imports for update
  to authenticated
  using (public.is_admin() or public.has_permission('avus.create'))
  with check (public.is_admin() or public.has_permission('avus.create'));

create policy "sap_records are readable by importers"
  on public.sap_records for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('avus.view_all')
    or public.has_permission('avus.create')
  );

create policy "sap_records are insertable by importers"
  on public.sap_records for insert
  to authenticated
  with check (public.is_admin() or public.has_permission('avus.create'));

create policy "sap_records are updatable by importers"
  on public.sap_records for update
  to authenticated
  using (public.is_admin() or public.has_permission('avus.create'))
  with check (public.is_admin() or public.has_permission('avus.create'));

-- ---------------------------------------------------------------------------
-- Helper: normaliza um número de AVU pra comparação (remove tudo que não é
-- letra/dígito, maiúsculas) — "AVU-2026-0041" e "avu2026 0041" comparam iguais.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_avu_numero(p_value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

comment on function public.normalize_avu_numero(text) is 'Remove hífens/espaços e uppercasa, para comparar numero_avu (formato interno) com o número extraído da descrição do SAP (match exato normalizado).';

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.sap_import_start(
  p_import_id uuid,
  p_file_name text,
  p_file_type text,
  p_regex_pattern text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if not (public.is_admin() or public.has_permission('avus.create')) then
    raise exception 'Você não tem permissão para importar dados do SAP' using errcode = 'insufficient_privilege';
  end if;

  insert into public.sap_imports (id, file_name, file_type, regex_pattern, created_by, status)
  values (p_import_id, p_file_name, p_file_type, p_regex_pattern, auth.uid(), 'PROCESSANDO');

  return p_import_id;
end;
$$;

comment on function public.sap_import_start(uuid, text, text, text) is 'Registra um arquivo SAP recebido (status PROCESSANDO). Chamado pelo frontend logo após o parsing (CSV/XLSX roda no navegador, sem tocar em nenhum segredo).';

-- Processa o lote inteiro numa chamada só: recebe os registros já parseados
-- (CSV/XLSX) e com o número da AVU já extraído pelo regex (roda no client,
-- é barato). Uma linha malformada não derruba o lote inteiro — cai em ERRO
-- e o loop continua.
create or replace function public.sap_import_process_batch(p_import_id uuid, p_records jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_record jsonb;
  v_nota text;
  v_numero_extraido text;
  v_avu_id uuid;
  v_match_status public.sap_record_match_status;
  v_error_message text;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_duplicate integer := 0;
  v_error integer := 0;
  v_total integer := 0;
begin
  if not (public.is_admin() or public.has_permission('avus.create')) then
    raise exception 'Você não tem permissão para importar dados do SAP' using errcode = 'insufficient_privilege';
  end if;

  for v_record in select * from jsonb_array_elements(p_records)
  loop
    v_total := v_total + 1;
    v_error_message := null;
    v_avu_id := null;

    begin
      v_nota := nullif(trim(v_record ->> 'nota'), '');
      v_numero_extraido := nullif(trim(v_record ->> 'avuNumeroExtraido'), '');

      if v_nota is not null and exists (
        select 1 from public.sap_records where nota = v_nota
      ) then
        v_match_status := 'DUPLICADO';
        v_duplicate := v_duplicate + 1;
      elsif v_numero_extraido is null then
        v_match_status := 'AVU_NAO_ENCONTRADO';
        v_unmatched := v_unmatched + 1;
      else
        select id into v_avu_id
        from public.avus
        where public.normalize_avu_numero(numero_avu) = public.normalize_avu_numero(v_numero_extraido)
        limit 1;

        if v_avu_id is not null then
          update public.avus
          set nota_sap = coalesce(v_nota, nota_sap), ordem_manutencao = coalesce(nullif(trim(v_record ->> 'om'), ''), ordem_manutencao)
          where id = v_avu_id;
          v_match_status := 'RELACIONADO';
          v_matched := v_matched + 1;
        else
          v_match_status := 'AVU_NAO_ENCONTRADO';
          v_unmatched := v_unmatched + 1;
        end if;
      end if;
    exception when others then
      v_match_status := 'ERRO';
      v_error_message := sqlerrm;
      v_avu_id := null;
      v_error := v_error + 1;
    end;

    insert into public.sap_records (
      sap_import_id, nota, om, status_sap, centro, data_planejada, data_execucao,
      prioridade_sap, descricao, avu_numero_extraido, avu_id, match_status, error_message
    )
    values (
      p_import_id,
      v_nota,
      nullif(trim(v_record ->> 'om'), ''),
      nullif(trim(v_record ->> 'statusSap'), ''),
      nullif(trim(v_record ->> 'centro'), ''),
      (nullif(trim(v_record ->> 'dataPlanejada'), ''))::date,
      (nullif(trim(v_record ->> 'dataExecucao'), ''))::date,
      nullif(trim(v_record ->> 'prioridadeSap'), ''),
      nullif(trim(v_record ->> 'descricao'), ''),
      v_numero_extraido,
      v_avu_id,
      v_match_status,
      v_error_message
    );
  end loop;

  update public.sap_imports
  set status = 'PROCESSADO', total_records = v_total, matched_count = v_matched,
      unmatched_count = v_unmatched, duplicate_count = v_duplicate, error_count = v_error
  where id = p_import_id;

  return jsonb_build_object(
    'total', v_total, 'matched', v_matched, 'unmatched', v_unmatched,
    'duplicate', v_duplicate, 'error', v_error
  );
end;
$$;

comment on function public.sap_import_process_batch(uuid, jsonb) is 'Processa o lote inteiro de registros SAP já parseados: duplicata por Nota, casamento com AVU por número normalizado, atualização de nota_sap/ordem_manutencao. Nunca lança por causa de uma linha só — cada linha tem sua própria captura de exceção.';

-- Reprocessa os sap_records já salvos de um import (sem reimportar o arquivo)
-- — útil depois de ajustar o regex ou quando mais AVUs passaram a existir.
create or replace function public.sap_import_retry(p_import_id uuid, p_regex_pattern text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_record public.sap_records%rowtype;
  v_avu_id uuid;
  v_match_status public.sap_record_match_status;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_duplicate integer := 0;
  v_error integer := 0;
  v_total integer := 0;
begin
  if not (public.is_admin() or public.has_permission('avus.create')) then
    raise exception 'Você não tem permissão para reprocessar importações do SAP' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.sap_imports where id = p_import_id) then
    raise exception 'Importação não encontrada' using errcode = 'no_data_found';
  end if;

  if p_regex_pattern is not null then
    update public.sap_imports set regex_pattern = p_regex_pattern where id = p_import_id;
  end if;

  for v_record in select * from public.sap_records where sap_import_id = p_import_id
  loop
    v_total := v_total + 1;
    v_avu_id := null;

    begin
      if v_record.nota is not null and exists (
        select 1 from public.sap_records where nota = v_record.nota and id <> v_record.id
          and (created_at, id) < (v_record.created_at, v_record.id)
      ) then
        v_match_status := 'DUPLICADO';
        v_duplicate := v_duplicate + 1;
      elsif v_record.avu_numero_extraido is null then
        v_match_status := 'AVU_NAO_ENCONTRADO';
        v_unmatched := v_unmatched + 1;
      else
        select id into v_avu_id
        from public.avus
        where public.normalize_avu_numero(numero_avu) = public.normalize_avu_numero(v_record.avu_numero_extraido)
        limit 1;

        if v_avu_id is not null then
          update public.avus
          set nota_sap = coalesce(v_record.nota, nota_sap), ordem_manutencao = coalesce(v_record.om, ordem_manutencao)
          where id = v_avu_id;
          v_match_status := 'RELACIONADO';
          v_matched := v_matched + 1;
        else
          v_match_status := 'AVU_NAO_ENCONTRADO';
          v_unmatched := v_unmatched + 1;
        end if;
      end if;

      update public.sap_records
      set avu_id = v_avu_id, match_status = v_match_status, error_message = null
      where id = v_record.id;
    exception when others then
      update public.sap_records
      set avu_id = null, match_status = 'ERRO', error_message = sqlerrm
      where id = v_record.id;
      v_error := v_error + 1;
    end;
  end loop;

  update public.sap_imports
  set status = 'PROCESSADO', total_records = v_total, matched_count = v_matched,
      unmatched_count = v_unmatched, duplicate_count = v_duplicate, error_count = v_error
  where id = p_import_id;

  return jsonb_build_object(
    'total', v_total, 'matched', v_matched, 'unmatched', v_unmatched,
    'duplicate', v_duplicate, 'error', v_error
  );
end;
$$;

comment on function public.sap_import_retry(uuid, text) is 'Reaplica o casamento SAP→AVU sobre os sap_records já salvos (sem reimportar o arquivo) — útil após ajustar o regex ou quando mais AVUs passam a existir.';
