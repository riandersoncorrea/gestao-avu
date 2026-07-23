-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0013: "Emitente" na importação de PDF era um Select vinculado a
-- avus.emitente (uuid, FK pra profiles) — só funciona se o nome extraído do
-- PDF bater exatamente com um usuário já cadastrado no sistema. Na prática o
-- emitente de uma AVU é quem reportou a vulnerabilidade em campo, que muitas
-- vezes não é um usuário deste sistema (ver docs/testing.md, PDF real: o
-- perfil "Elinne Aguiar Cardoso Dias" não tinha cadastro).
--
-- Adiciona uma coluna de texto livre, aditiva — não mexe na FK existente
-- (avus.emitente continua funcionando exatamente como antes para os outros
-- usos já espalhados pelo app: filtro/agrupamento do Dashboard, formulário
-- manual de criação de AVU, timeline de auditoria). `emitente_nome` é
-- preenchida sempre com o texto extraído/editado do PDF; `emitente` continua
-- sendo preenchida só nos casos em que esse nome bate com um perfil
-- cadastrado (resolveEmitenteId, na Edge Function — comportamento inalterado).

alter table public.avus add column emitente_nome text;

comment on column public.avus.emitente_nome is 'Nome do emitente em texto livre (ex.: extraído do PDF de importação) — usado quando o emitente não é necessariamente um usuário cadastrado no sistema. avus.emitente (FK pra profiles) continua sendo o vínculo "oficial" quando existe.';

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

  v_numero_avu := nullif(trim(p_fields ->> 'numeroAvu'), '');
  if v_numero_avu is not null and exists (select 1 from public.avus where numero_avu = v_numero_avu) then
    raise exception 'Já existe uma AVU cadastrada com o número %. Edite o número ou confirme que esta é uma reimportação intencional antes de continuar.', v_numero_avu
      using errcode = 'unique_violation';
  end if;

  insert into public.avus (
    numero_avu, data_criacao, gerencia_responsavel, data_limite, emitente, emitente_nome,
    projeto, local, latitude, longitude, descricao, categoria, subcategoria,
    nivel_confianca_ia
  )
  values (
    v_numero_avu,
    coalesce((p_fields ->> 'dataCriacao')::date, current_date),
    nullif(trim(p_fields ->> 'gerenciaResponsavel'), ''),
    (p_fields ->> 'dataLimite')::date,
    (p_fields ->> 'emitenteId')::uuid,
    nullif(trim(p_fields ->> 'emitenteNome'), ''),
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

comment on function public.avu_import_confirm_create_avu(uuid, jsonb, text, text) is 'Cria a linha real em avus a partir de uma importação (automático quando a validação passa, ou disparado pelo humano na tela de revisão). Grava emitente_nome (texto livre) sempre, e emitente (FK) só quando resolvido para um perfil cadastrado. Rejeita Número do AVU duplicado com mensagem clara antes de tentar o insert. Não mexe em Storage — isso é feito pela Edge Function.';
