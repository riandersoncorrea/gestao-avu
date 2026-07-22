-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0010: Governança/Rastreabilidade — auditoria com diff real (o que
-- mudou, valor anterior/novo) e log de acesso ("quem acessou"), novos eventos
-- de notificação (evidência enviada, Nota/OM do SAP vinculada) e checagem de
-- prazo próximo/vencido sob demanda (sem pg_cron — projeto está no plano
-- Supabase Free, onde a extensão normalmente não está disponível; ver
-- docs/architecture.md para o caminho de upgrade). Nenhuma tabela nova —
-- tudo é extensão de audit_logs/notifications já existentes.

-- ---------------------------------------------------------------------------
-- Auditoria — diff real em audit_avus_change() (antes só gravava
-- 'avu.updated' com metadata=null; agora grava só os campos que de fato
-- mudaram, com valor anterior e novo). Status continua fora daqui —
-- responsabilidade de avu_status_history, sem mudança nesse ponto.
-- ---------------------------------------------------------------------------
create or replace function public.audit_avus_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.status is distinct from old.status then
    return new;
  end if;

  if old.descricao is distinct from new.descricao then
    v_changes := v_changes || jsonb_build_object('descricao', jsonb_build_object('from', old.descricao, 'to', new.descricao));
  end if;
  if old.categoria is distinct from new.categoria then
    v_changes := v_changes || jsonb_build_object('categoria', jsonb_build_object('from', old.categoria, 'to', new.categoria));
  end if;
  if old.subcategoria is distinct from new.subcategoria then
    v_changes := v_changes || jsonb_build_object('subcategoria', jsonb_build_object('from', old.subcategoria, 'to', new.subcategoria));
  end if;
  if old.local is distinct from new.local then
    v_changes := v_changes || jsonb_build_object('local', jsonb_build_object('from', old.local, 'to', new.local));
  end if;
  if old.projeto is distinct from new.projeto then
    v_changes := v_changes || jsonb_build_object('projeto', jsonb_build_object('from', old.projeto, 'to', new.projeto));
  end if;
  if old.gerencia_responsavel is distinct from new.gerencia_responsavel then
    v_changes := v_changes || jsonb_build_object('gerencia_responsavel', jsonb_build_object('from', old.gerencia_responsavel, 'to', new.gerencia_responsavel));
  end if;
  if old.empresa_executante is distinct from new.empresa_executante then
    v_changes := v_changes || jsonb_build_object('empresa_executante', jsonb_build_object('from', old.empresa_executante, 'to', new.empresa_executante));
  end if;
  if old.data_limite is distinct from new.data_limite then
    v_changes := v_changes || jsonb_build_object('data_limite', jsonb_build_object('from', old.data_limite, 'to', new.data_limite));
  end if;
  if old.emitente is distinct from new.emitente then
    v_changes := v_changes || jsonb_build_object('emitente', jsonb_build_object('from', old.emitente, 'to', new.emitente));
  end if;
  if old.responsavel is distinct from new.responsavel then
    v_changes := v_changes || jsonb_build_object('responsavel', jsonb_build_object('from', old.responsavel, 'to', new.responsavel));
  end if;
  if old.fiscal is distinct from new.fiscal then
    v_changes := v_changes || jsonb_build_object('fiscal', jsonb_build_object('from', old.fiscal, 'to', new.fiscal));
  end if;
  if old.prioridade is distinct from new.prioridade then
    v_changes := v_changes || jsonb_build_object('prioridade', jsonb_build_object('from', old.prioridade, 'to', new.prioridade));
  end if;
  if old.nota_sap is distinct from new.nota_sap then
    v_changes := v_changes || jsonb_build_object('nota_sap', jsonb_build_object('from', old.nota_sap, 'to', new.nota_sap));
  end if;
  if old.ordem_manutencao is distinct from new.ordem_manutencao then
    v_changes := v_changes || jsonb_build_object('ordem_manutencao', jsonb_build_object('from', old.ordem_manutencao, 'to', new.ordem_manutencao));
  end if;
  if old.latitude is distinct from new.latitude then
    v_changes := v_changes || jsonb_build_object('latitude', jsonb_build_object('from', old.latitude, 'to', new.latitude));
  end if;
  if old.longitude is distinct from new.longitude then
    v_changes := v_changes || jsonb_build_object('longitude', jsonb_build_object('from', old.longitude, 'to', new.longitude));
  end if;

  if v_changes = '{}'::jsonb then
    return new;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'avu.updated', 'avus', new.id, jsonb_build_object('changes', v_changes));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auditoria — "quem acessou". Chamada pelo frontend uma vez por visualização
-- do detalhe da AVU (nunca por job de sistema) — nunca lança erro, só não
-- grava nada se o usuário não puder ver a AVU (ou ela não existir).
-- ---------------------------------------------------------------------------
create or replace function public.log_avu_access(p_avu_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.can_view_avu(p_avu_id) then
    return;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'avu.viewed', 'avus', p_avu_id, null);
end;
$$;

comment on function public.log_avu_access(uuid) is 'Registra que o usuário autenticado visualizou o detalhe de uma AVU ("quem acessou"). Nunca lança erro — só não grava nada se a AVU não existir ou não for visível para quem chamou.';

-- ---------------------------------------------------------------------------
-- Notificações — nova evidência enviada (avu_submit_evidence já existia
-- desde 0003/0004, redefinida aqui só para adicionar o fan-out; nenhuma
-- mudança na validação/transição de status já existente).
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

  if v_avu.fiscal is not null and v_avu.fiscal <> auth.uid() then
    insert into public.notifications (user_id, title, body, entity, entity_id)
    values (
      v_avu.fiscal,
      'Nova evidência enviada',
      format('A AVU %s recebeu evidências e aguarda sua aprovação.', v_avu.numero_avu),
      'avus',
      p_avu_id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notificações — Nota/OM do SAP vinculada (sap_import_process_batch e
-- sap_import_retry já existiam desde 0009, redefinidas aqui só para
-- adicionar o fan-out quando uma linha vira RELACIONADO; a lógica de
-- casamento/duplicata/atualização de nota_sap/ordem_manutencao não muda
-- em nada).
-- ---------------------------------------------------------------------------
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
  v_avu_numero text;
  v_fiscal uuid;
  v_responsavel uuid;
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
    v_avu_numero := null;
    v_fiscal := null;
    v_responsavel := null;

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
          where id = v_avu_id
          returning numero_avu, fiscal, responsavel into v_avu_numero, v_fiscal, v_responsavel;
          v_match_status := 'RELACIONADO';
          v_matched := v_matched + 1;

          insert into public.notifications (user_id, title, body, entity, entity_id)
          select p.id, 'Nota SAP vinculada',
            format('A Nota SAP %s foi vinculada à AVU %s.', coalesce(v_nota, '—'), v_avu_numero),
            'avus', v_avu_id
          from public.profiles p
          where p.id in (v_fiscal, v_responsavel) and p.id <> auth.uid();
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

create or replace function public.sap_import_retry(p_import_id uuid, p_regex_pattern text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_record public.sap_records%rowtype;
  v_avu_id uuid;
  v_avu_numero text;
  v_fiscal uuid;
  v_responsavel uuid;
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
    v_avu_numero := null;
    v_fiscal := null;
    v_responsavel := null;

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
          where id = v_avu_id
          returning numero_avu, fiscal, responsavel into v_avu_numero, v_fiscal, v_responsavel;
          v_match_status := 'RELACIONADO';
          v_matched := v_matched + 1;

          -- Só notifica quando o vínculo é novo (evita spam a cada clique em "Reprocessar"
          -- sobre um registro que já estava relacionado à mesma AVU).
          if v_record.avu_id is distinct from v_avu_id then
            insert into public.notifications (user_id, title, body, entity, entity_id)
            select p.id, 'Nota SAP vinculada',
              format('A Nota SAP %s foi vinculada à AVU %s.', coalesce(v_record.nota, '—'), v_avu_numero),
              'avus', v_avu_id
            from public.profiles p
            where p.id in (v_fiscal, v_responsavel) and p.id <> auth.uid();
          end if;
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

-- ---------------------------------------------------------------------------
-- Notificações — prazo próximo / AVU vencida, sob demanda (sem pg_cron).
-- Chamada pelo frontend (MainLayout, uma vez por sessão com throttle no
-- client) ou manualmente por um admin. Idempotente: não duplica notificação
-- do mesmo título pra mesma AVU dentro de 20h. Limiar de 3 dias replica
-- WARNING_THRESHOLD_DAYS de src/features/avus/sla.ts — mantenha os dois
-- em sincronia se esse número mudar.
-- ---------------------------------------------------------------------------
create or replace function public.avu_generate_deadline_notifications()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_avu record;
  v_dias integer;
  v_title text;
  v_body text;
  v_proximo integer := 0;
  v_vencidas integer := 0;
begin
  for v_avu in
    select id, numero_avu, data_limite, fiscal, responsavel, empresa_executante
    from public.avus
    where data_limite is not null
      and status not in ('CONCLUIDO', 'REPROVADO', 'CANCELADO')
  loop
    v_dias := v_avu.data_limite - current_date;

    if v_dias < 0 then
      v_title := 'AVU vencida';
      v_body := format('A AVU %s está vencida há %s dia(s).', v_avu.numero_avu, abs(v_dias));
    elsif v_dias <= 3 then
      v_title := 'Prazo próximo';
      v_body := format('A AVU %s vence em %s dia(s).', v_avu.numero_avu, v_dias);
    else
      continue;
    end if;

    if exists (
      select 1 from public.notifications
      where entity = 'avus' and entity_id = v_avu.id and title = v_title
        and created_at > now() - interval '20 hours'
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, title, body, entity, entity_id)
    select p.id, v_title, v_body, 'avus', v_avu.id
    from public.profiles p
    where p.id in (v_avu.fiscal, v_avu.responsavel)
       or (v_avu.empresa_executante is not null and p.company_name is not null
           and lower(trim(p.company_name)) = lower(trim(v_avu.empresa_executante)));

    if v_dias < 0 then
      v_vencidas := v_vencidas + 1;
    else
      v_proximo := v_proximo + 1;
    end if;
  end loop;

  return jsonb_build_object('prazo_proximo', v_proximo, 'vencidas', v_vencidas);
end;
$$;

comment on function public.avu_generate_deadline_notifications() is 'Gera notificações de prazo próximo (<=3 dias) e AVU vencida para fiscal/responsável/contratada. Idempotente (não duplica a mesma notificação em 20h). Chamada sob demanda pelo client — este projeto não tem pg_cron habilitado (plano Supabase Free); ver docs/architecture.md.';
