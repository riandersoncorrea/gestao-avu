-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0011: correções no pipeline de importação de PDF (Sprint 9 tinha
-- sido escrita sem nenhum PDF real disponível — ver docs/testing.md). Este
-- arquivo cobre só o que precisa de mudança de schema/RPC; a maior parte da
-- correção é em código (Edge Function), não em banco.
--
-- 1) Miniaturas na tela de revisão: a Edge Function agora sobe as imagens
--    extraídas pro bucket de staging (mesmo bucket do PDF) já na primeira
--    passada (`processImport`), não só depois da confirmação — para isso a
--    fila precisa guardar os paths e a contagem.
-- 2) Duplicidade de Número do AVU: antes só existia a constraint `unique` de
--    `avus.numero_avu`, que falhava com erro cru do Postgres. Agora
--    `avu_import_confirm_create_avu` verifica antes e levanta uma mensagem
--    clara, deixando a importação em REVISAO_NECESSARIA para o usuário
--    decidir (editar o número e reenviar, ou reconhecer que já existe).

alter table public.avu_imports
  add column staging_image_paths text[] not null default '{}',
  add column image_count integer not null default 0;

comment on column public.avu_imports.staging_image_paths is 'Paths das imagens extraídas do PDF dentro do bucket avu-import-staging — populado por processImport, usado pela tela de revisão para miniaturas antes da confirmação.';
comment on column public.avu_imports.image_count is 'Contagem de imagens extraídas do PDF (mesmo valor de length(staging_image_paths), exposto à parte para não obrigar o frontend a inspecionar o array só para contar).';

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
  v_numero_avu text;
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

  -- Antes só existia a constraint `unique` de avus.numero_avu — o insert falhava
  -- com um erro cru do Postgres em vez de uma mensagem que o usuário entenda.
  v_numero_avu := nullif(trim(p_fields ->> 'numeroAvu'), '');
  if v_numero_avu is not null and exists (select 1 from public.avus where numero_avu = v_numero_avu) then
    raise exception 'Já existe uma AVU cadastrada com o número %. Edite o número ou confirme que esta é uma reimportação intencional antes de continuar.', v_numero_avu
      using errcode = 'unique_violation';
  end if;

  insert into public.avus (
    numero_avu, data_criacao, gerencia_responsavel, data_limite, emitente,
    projeto, local, latitude, longitude, descricao, categoria, subcategoria,
    nivel_confianca_ia
  )
  values (
    v_numero_avu,
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

comment on function public.avu_import_confirm_create_avu(uuid, jsonb, text, text) is 'Cria a linha real em avus a partir de uma importação (automático quando a validação passa, ou disparado pelo humano na tela de revisão). Rejeita Número do AVU duplicado com mensagem clara antes de tentar o insert. Não mexe em Storage — isso é feito pela Edge Function.';
