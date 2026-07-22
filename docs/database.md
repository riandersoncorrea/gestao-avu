# Banco de Dados — Gestão de AVU

Schema versionado em `supabase/migrations/`. Tabelas de negócio além de `avus` (`planning`, `contractors`, `inspections`, ...) ficam para as próximas sprints (ver [roadmap.md](./roadmap.md)).

## Migration `0001_init.sql`

### Tabelas

| Tabela | Propósito |
|---|---|
| `roles` | Papéis de acesso (admin, fiscal, planejador, contratada) |
| `permissions` | Permissões granulares por chave (ex.: `avus.create`) |
| `role_permissions` | Associação N:N entre `roles` e `permissions` |
| `profiles` | Perfil do usuário autenticado, 1:1 com `auth.users` |
| `audit_logs` | Trilha de auditoria (ator, ação, entidade, metadata) |

### Relacionamentos

```
auth.users (Supabase Auth)
    │ 1:1 (trigger handle_new_user cria a linha automaticamente)
    ▼
profiles ──N:1──► roles ──N:N──► permissions
                                  (via role_permissions)

audit_logs.actor_id ──N:1──► profiles
```

### Automatizações

- **`handle_new_user()`**: trigger em `auth.users` (`after insert`) que cria a linha correspondente em `profiles`, usando `raw_user_meta_data.full_name` quando disponível, senão o e-mail.
- **`set_updated_at()`**: trigger genérico que mantém `profiles.updated_at` em dia — reaproveitável em tabelas futuras.
- **`is_admin()`**: função `security definer` usada nas policies de RLS para checar se o usuário autenticado tem `role.name = 'admin'`.

### Row Level Security

RLS habilitado em todas as tabelas desta migration.

| Tabela | Leitura | Escrita |
|---|---|---|
| `roles`, `permissions`, `role_permissions` | qualquer usuário autenticado | apenas admins |
| `profiles` | qualquer usuário autenticado (diretório de usuários) | o próprio usuário (ou admin) atualiza; inserção manual restrita a admin (o fluxo normal é via trigger) |
| `audit_logs` | o próprio ator (`actor_id = auth.uid()`) ou admin | sem policy de `insert`/`update`/`delete` para o client — a escrita é feita por funções/triggers com `security definer` ou pela service role |

### Seed inicial

A migration já insere 4 roles padrão: `admin`, `fiscal`, `planejador`, `contratada`. Nenhuma permissão é semeada ainda — a granularidade de `permissions`/`role_permissions` será definida junto com as primeiras features de negócio.

## Migration `0002_rbac_and_invites.sql`

Substitui o modelo "um papel por perfil" (`profiles.role_id`) por RBAC many-to-many completo para os 7 perfis do negócio, e adiciona o fluxo de convites que permite auto-cadastro sem expor a `service_role key` no cliente.

### Tabelas novas

| Tabela | Propósito |
|---|---|
| `user_roles` | Atribuição de perfis a usuários (many-to-many: um usuário pode ter mais de um perfil) |
| `user_invites` | Convite de cadastro: e-mail + perfil pré-atribuído; só admin cria/lê/apaga |

### Alterações em tabelas existentes

- `profiles.role_id` **removida** (substituída por `user_roles`).
- `profiles.is_active` (boolean, default `true`) — permite desativar um usuário sem apagar a conta.
- `audit_logs`: policy de leitura ganha `or has_permission('history.view')` (Segurança Empresarial vê todo o histórico, não só o próprio).

### Os 7 perfis e suas permissões (seed)

| Perfil (`roles.name`) | Permissões (`permissions.key`) |
|---|---|
| `admin` | acesso total via `is_admin()` — não depende de `role_permissions` |
| `seguranca_empresarial` | `avus.view_all`, `avus.create`, `security.manage`, `history.view` |
| `planejamento` | `avus.view_all`, `planning.manage`, `noms.view` |
| `fiscal` | `avus.view_assigned`, `evidence.analyze`, `execution.approve` |
| `contratada` | `avus.view_assigned`, `evidence.submit` |
| `gestor` | `indicators.view`, `avus.view_area` |
| `leitor` | `readonly.view` |

`avus.view_assigned` (Fiscal/Contratada) e `avus.view_area` (Gestor) ganharam escopo real por linha na migration `0003_avus.sql` (ver abaixo), via `can_view_avu()`.

### Funções de autorização

- `is_admin()` — reescrita para checar `user_roles` (antes checava `profiles.role_id`).
- `has_role(role_slug)` — o usuário atual tem esse perfil?
- `has_permission(permission_key)` — o usuário atual (via qualquer um dos seus perfis) tem essa permissão? `is_admin()` sempre retorna `true` aqui.
- `is_active_user()` — o usuário atual está com `profiles.is_active = true`?

Todas `security definer`, pensadas para serem usadas dentro de policies de RLS (inclusive nas próximas migrations, para as tabelas de AVUs).

### `handle_new_user()` — bootstrap + convite

1. Sempre cria a linha em `profiles`.
2. **Se `user_roles` estiver vazia no sistema inteiro** → este é o primeiro usuário → vira `admin` automaticamente (bootstrap).
3. **Caso contrário** → procura um `user_invites` não usado para o e-mail. Se não achar, `raise exception` — isso reverte a transação inteira, incluindo o `insert` em `auth.users`, então o cadastro falha de ponta a ponta (o Supabase Auth devolve erro ao cliente). Se achar, atribui o `role_id` do convite e marca `used_at`.

> **Atenção operacional**: crie a conta admin (primeiro cadastro em `/cadastro`) antes de divulgar a URL de cadastro publicamente — o primeiro cadastro do sistema sempre vira admin.

### Auditoria automática

Trigger `user_roles_audit` (`after insert or delete` em `user_roles`) grava em `audit_logs` toda atribuição/remoção de perfil — não depende do frontend chamar nada, então nem uma RPC comprometida escaparia da trilha.

### RPCs administrativas

- `admin_set_user_roles(target_user_id, role_ids[])` — substitui atomicamente os perfis de um usuário. Rejeita quem não é admin (`raise exception`) mesmo que alguém chame a função direto via `supabase.rpc(...)` sem passar pela UI.
- `admin_set_user_active(target_user_id, active)` — ativa/desativa um usuário e grava em `audit_logs`. Mesma proteção contra chamada direta.

### RLS

| Tabela | Leitura | Escrita |
|---|---|---|
| `user_roles` | o próprio (`user_id = auth.uid()`) ou admin | **nenhuma policy de insert/update/delete para o client** — só é possível escrever via `handle_new_user()` (trigger) ou `admin_set_user_roles()` (RPC), ambas `security definer` |
| `user_invites` | só admin | só admin (insert/delete) |

### Bootstrap do primeiro admin — passo a passo

1. Aplicar a migration (ver "Como aplicar" abaixo).
2. Acessar `/cadastro` e criar a primeira conta — ela vira admin automaticamente.
3. Confirmar o e-mail (obrigatório neste projeto — `mailer_autoconfirm=false`).
4. Entrar, ir em Administração → Convites, e convidar as próximas pessoas com o perfil correto.

## Migration `0003_avus.sql`

Núcleo do sistema: a tabela `avus` e tudo que gira em torno dela (comentários, anexos, escopo por linha, ações sensíveis via RPC, auditoria automática).

### Tabelas novas

| Tabela | Propósito |
|---|---|
| `avus` | A própria Análise de Vulnerabilidade — todos os campos pedidos (identificação, prazo, localização, responsáveis, integração SAP) |
| `avu_comments` | Comentários da aba "Comentários" |
| `avu_attachments` | Metadados dos arquivos das abas "Documentos"/"Fotos" (binário no bucket `avu-attachments`) |

### Alterações em tabelas existentes

- `profiles.company_name` (text, nullable) — empresa da Contratada, usada para casar com `avus.empresa_executante`.
- `profiles.area` (text, nullable) — área do Gestor, usada para casar com `avus.gerencia_responsavel`.

### `avus` — campos e decisões

Todos os campos pedidos, mais `created_at`/`updated_at`. Decisões que fogem do óbvio:

- `status` é um `enum avu_status` com os 10 valores exatos pedidos (`NOVO` é o default).
- `numero_avu` é gerado automaticamente (`AVU-<ano>-<sequência com zero à esquerda>`) por um trigger `before insert` (`set_avu_numero()`) quando não informado — não precisa ser digitado no formulário.
- `emitente`, `responsavel` e `fiscal` são `uuid` referenciando `profiles(id)` (não texto) — permite seletor de usuário no formulário e faz o RLS do Fiscal funcionar por igualdade de UUID.
- `empresa_executante` e `gerencia_responsavel` continuam texto livre (como pedido) — o casamento com `profiles.company_name`/`profiles.area` é feito com `lower(trim(...))` para tolerar diferença de caixa/espaço.
- `nivel_confianca_ia` tem `check` garantindo 0–100 quando não nulo.

### Visibilidade por linha (escopo de cada perfil)

- **`can_view_avu(avu_id)`**: `is_admin()` **ou** `has_permission('avus.view_all')`/`'readonly.view'` (Segurança Empresarial, Planejamento, Leitor veem tudo) **ou** é o Fiscal atribuído (`fiscal = auth.uid()`) **ou** é Contratada da empresa executante (`profiles.company_name` bate com `avus.empresa_executante`) **ou** é Gestor da área (`profiles.area` bate com `avus.gerencia_responsavel`).
- **`can_write_avu_related(avu_id)`**: igual a `can_view_avu()`, mas exclui quem só tem `readonly.view` — usada nas policies de `avu_comments`/`avu_attachments` para o Leitor não poder comentar nem anexar (só ler).

### RLS de `avus`

| Operação | Regra |
|---|---|
| `select` | `can_view_avu(id)` |
| `insert` | `is_admin()` ou `has_permission('avus.create')` (Segurança Empresarial) |
| `update` | `is_admin()`, `has_permission('avus.create')`, ou Planejamento com `planning.manage` — edição geral de campos |
| `delete` | só `is_admin()` |

**Fiscal e Contratada não têm policy de `update` genérica** — a única forma deles mudarem uma AVU é pelas RPCs abaixo, que fazem sua própria checagem de autorização. Isso segue o mesmo princípio das RPCs administrativas da Sprint 1: a ação sensível vive numa função, não numa policy ampla de `UPDATE ... WHERE`.

### RPCs de ações sensíveis

- **`avu_submit_evidence(p_avu_id, p_note)`**: só Contratada da empresa executante da AVU. Muda `status` para `AGUARDANDO_APROVACAO`, opcionalmente grava um comentário, audita.
- **`avu_review_execution(p_avu_id, p_approved, p_note)`**: só o Fiscal atribuído (ou admin). Muda `status` para `CONCLUIDO` ou `REPROVADO`, opcionalmente grava um comentário, audita.

Ambas rejeitam (`raise exception`) quem não tem autorização, mesmo que a chamada venha direto de `supabase.rpc(...)` sem passar pela UI.

### Anexos — Supabase Storage

Bucket **`avu-attachments`** (privado). Convenção de path: `<avu_id>/<uuid>-<nome-original>` — o primeiro segmento do path é o `avu_id`, usado pelas policies de `storage.objects` (via `(storage.foldername(name))[1]`) para aplicar exatamente o mesmo `can_view_avu()`/`can_write_avu_related()` da tabela `avus`. Download é sempre via signed URL (10 min), nunca URL pública.

### Auditoria automática

- `avus_audit_insert` (`after insert`) → `audit_logs` com ação `avu.created`.
- `avus_audit_update` (`after update`) → `avu.updated` quando um campo comum muda. **Desde a migration `0004`, mudança de `status` não é mais logada aqui** — isso virou responsabilidade de `avu_status_history` (ver abaixo), que tem tipagem melhor (status anterior/novo como enum, não JSON) e comentário.

Isso é a "auditoria básica de alterações" pedida — automática, no banco, não depende do frontend chamar nada.

## Migration `0004_workflow_and_planning.sql`

Máquina de estados do fluxo operacional (NOVO → ... → CONCLUIDO) reforçada no Postgres, e o suporte de dados do módulo de Planejamento.

### `prioridade`

`create type avu_priority as enum ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA')`; `avus.prioridade` (not null, default `MEDIA`).

### Grafo de transições — `avu_status_transitions`

Tabela de referência (leitura aberta a qualquer autenticado, sem escrita pelo client) com os pares `(from_status, to_status)` permitidos:

```
NOVO → TRIAGEM, CANCELADO
TRIAGEM → PLANEJAMENTO, CANCELADO
PLANEJAMENTO → PROGRAMADO, CANCELADO
PROGRAMADO → EM_EXECUCAO, CANCELADO
EM_EXECUCAO → AGUARDANDO_EVIDENCIAS, CANCELADO
AGUARDANDO_EVIDENCIAS → AGUARDANDO_APROVACAO, CANCELADO
AGUARDANDO_APROVACAO → CONCLUIDO, REPROVADO, CANCELADO
REPROVADO → EM_EXECUCAO, CANCELADO
CONCLUIDO, CANCELADO → (terminais, sem saída)
```

`CANCELADO` é alcançável de qualquer status ativo (decisão administrativa/de planejamento); `REPROVADO → EM_EXECUCAO` é o caminho de retrabalho depois de uma reprovação. `is_valid_avu_transition(from, to)` consulta essa tabela.

### Validação reforçada no banco — não só no frontend

Trigger **`avus_validate_status_transition`** (`before update` em `avus`, só quando `status` muda): `is_admin()` bypassa; qualquer outro usuário só consegue mudar o status se `is_valid_avu_transition(old.status, new.status)` for verdadeiro — senão, `raise exception`. Isso vale igualmente para a RPC genérica de transição, para `avu_submit_evidence`/`avu_review_execution` (Sprint 2) e para um `UPDATE` direto — não tem como pular etapa nem pelo cliente Supabase direto.

### `avu_status_history` — histórico rico

`id, avu_id, changed_by, previous_status, new_status, comment, created_at`. RLS: leitura via `can_view_avu(avu_id)`; **sem policy de escrita para o client** — só o trigger `avus_record_status_history` (`after update`, `security definer`) grava, lendo o comentário de uma variável de sessão (`current_setting('avu.transition_comment', true)`) que a RPC/UPDATE seta antes de mudar o status. Isso evita duplicar a lógica de inserção em cada RPC.

### RPC `avu_transition_status(p_avu_id, p_new_status, p_comment)`

Autorização: `is_admin()` ou `has_permission('avus.create')` ou (`has_role('planejamento')` e `has_permission('planning.manage')`). **Para quem não é admin, rejeita explicitamente `AGUARDANDO_APROVACAO`/`CONCLUIDO`/`REPROVADO` como destino** — essas transições continuam reservadas a `avu_submit_evidence` (Contratada) e `avu_review_execution` (Fiscal), preservando a separação de responsabilidades da Sprint 2. Admin pode usar esta RPC (ou um `UPDATE` direto) para qualquer transição.

### `avu_planning_view`

`avus.*` + `status_since` (data da última linha em `avu_status_history` para aquela AVU, com fallback para `avus.created_at` quando não há histórico). Criada com `security_invoker = true` para herdar a RLS de `avus`/`avu_status_history` de quem consulta, não do dono da view. Usada pelo Kanban/Tabela de Planejamento para evitar N+1 queries calculando "tempo parado" por AVU.

> **Nota de implementação**: o frontend não usa embed de FK do PostgREST (`profiles!avus_fiscal_fkey(...)`) contra esta view — não é garantido que o PostgREST detecte relacionamentos de FK através de uma view. `planningService.ts` resolve nomes de emitente/responsável/fiscal com um mapa de perfis carregado à parte.

## Migration `0005_contractor_portal.sql`

Portal da Contratada: envio real de evidências (fotos/vídeos/documentos), distinto do anexo genérico de Documentos/Fotos.

### `avu_evidences`

`id, avu_id, tipo (foto/video/documento), arquivo, nome_arquivo, mime_type, tamanho_bytes, descricao, data_upload, usuario, latitude, longitude, data_execucao, equipe, equipamentos`. Diferente de `avu_attachments` (Sprint 2, gerenciador genérico de Documentos/Fotos que qualquer editor pode usar): esta tabela é especificamente a submissão formal de evidência da Contratada, amarrada ao fluxo de aprovação, com o contexto de execução (GPS, equipe, equipamentos, data). `data_execucao`/`equipe`/`equipamentos`/`descricao` são compartilhados por todos os arquivos de um mesmo envio (um envio = um formulário, N arquivos = N linhas com o mesmo contexto).

### RLS mais restrita que `avu_attachments`

- `select`: `can_view_avu(avu_id)` — qualquer um que vê a AVU vê a evidência (Fiscal precisa disso para aprovar/reprovar).
- `insert`: `is_admin() or (has_role('contratada') and can_view_avu(avu_id))`, e `usuario = auth.uid()` — diferente de `avu_attachments`, que usa o mais amplo `can_write_avu_related` (deixaria Planejamento/Segurança Empresarial/Gestor inserirem evidência, papel que não é deles).
- `delete`: próprio uploader ou admin.

### Storage — bucket `avu-evidences`

Convenção de path `avus/{avu_id}/evidences/{uuid}-{nome}` (diferente de `avu-attachments`, que usa `{avu_id}/{uuid}-{nome}` direto na raiz) — por isso a policy de `storage.objects` usa `(storage.foldername(name))[2]` como `avu_id` (índice 2, não 1: o primeiro segmento é o literal `avus`). Bucket com `file_size_limit` de 100MB (acomoda vídeo) e `allowed_mime_types` restrito a imagem/vídeo/PDF/Office.

### Correção no grafo de transições — `EM_EXECUCAO → AGUARDANDO_APROVACAO`

Descoberta na verificação manual desta sprint: essa transição nunca tinha sido adicionada a `avu_status_transitions` (Sprint 3), mas o frontend sempre ofereceu o envio de evidência a partir de `EM_EXECUCAO` (não só de `AGUARDANDO_EVIDENCIAS`) — sem esse par no grafo, `avu_submit_evidence` falhava no trigger de validação de transição sempre que a Contratada tentava enviar evidência de uma AVU ainda em `EM_EXECUCAO`. Corrigido no seed e em `features/planning/transitions.ts`.

### `avu_submit_evidence` — validação nova

Passa a exigir `exists (select 1 from avu_evidences where avu_id = p_avu_id)` antes de permitir a transição para `AGUARDANDO_APROVACAO` — sem isso, era possível "enviar evidência" sem nenhum arquivo anexado.

### Correção de RLS em `audit_logs`

A policy de Sprint 1 (`actor_id = auth.uid() or is_admin() or has_permission('history.view')`) fazia a timeline da AVU (`AvuTimeline`, que lê `audit_logs` para os eventos "AVU criada"/"Dados atualizados") ficar incompleta para quem não gerou o evento — Contratada/Fiscal/Gestor só viam ações que eles mesmos fizeram. Passa a incluir `or (entity = 'avus' and can_view_avu(entity_id))`: quem pode ver a AVU, vê o histórico completo dela, não só suas próprias ações.

## Migration `0006_fiscalizacao.sql`

Módulo de Fiscalização: decisão do Fiscal sobre evidências (aprovar/reprovar/solicitar complementação), auditoria dedicada e notificações.

### Novas transições — `AGUARDANDO_APROVACAO → EM_EXECUCAO`/`AGUARDANDO_EVIDENCIAS`

Reprovar manda a AVU **direto para `EM_EXECUCAO`**, não para o status `REPROVADO` (pedido explícito da sprint). `REPROVADO` continua existindo no enum e no grafo por segurança/histórico, mas o novo fluxo não o usa mais — só é alcançável por `UPDATE` direto de admin. "Solicitar complementação" manda para `AGUARDANDO_EVIDENCIAS` (mesmo status já usado pelo caminho normal de planejamento).

### `avu_approvals` — auditoria dedicada das decisões do Fiscal

`id, avu_id, fiscal_id, decision (aprovado/reprovado/complementacao), comment, created_at`. RLS: select via `can_view_avu(avu_id)`; sem policy de insert/update para o client — só a RPC `avu_review_evidence` escreve.

### `notifications` — uma linha por destinatário

`id, user_id, title, body, entity, entity_id, read_at, created_at`. RLS: cada usuário só lê/marca como lida as próprias linhas; sem policy de insert para o client. Fan-out feito pela própria RPC no momento da decisão (não é um modelo de assinatura/broadcast) — vai para todo profile cujo `company_name` bate com `avus.empresa_executante` (a Contratada) e todo usuário com papel `planejamento`/`seguranca_empresarial`, excluindo quem tomou a decisão.

### `avu_review_evidence(p_avu_id, p_decision, p_comment)` — substitui `avu_review_execution`

Autorização: admin ou o fiscal responsável (`v_avu.fiscal is not null and v_avu.fiscal = auth.uid()` — **atenção ao `is not null` explícito**: sem ele, `has_role('fiscal') and v_avu.fiscal = auth.uid()` vira `NULL` quando `fiscal` é null, e um `if not (false or null)` em PL/pgSQL não dispara o `raise exception`, porque `if` só executa em `true`, nunca em `null` — isso permitia qualquer Fiscal "aprovar" uma AVU sem fiscal atribuído; achado e corrigido na verificação manual desta sprint). Exige `status = 'AGUARDANDO_APROVACAO'`. Grava a decisão em `avu_approvals`, seta o status via `CASE` (`aprovado→CONCLUIDO`, `reprovado→EM_EXECUCAO`, `complementacao→AGUARDANDO_EVIDENCIAS`) usando o mesmo GUC de comentário da Sprint 3 (a transição já cai em `avu_status_history` automaticamente), e dispara o fan-out de notificações. `avu_review_execution` (Sprint 2) foi removida (`drop function`) — sem chamador depois que o card "Revisão de execução" saiu do `AvuDetailPage`.

### Brecha fechada em `avu_transition_status`

A RPC genérica de planejamento já bloqueava `AGUARDANDO_APROVACAO`/`CONCLUIDO`/`REPROVADO` como *destino*, mas não bloqueava `EM_EXECUCAO`/`AGUARDANDO_EVIDENCIAS` quando a *origem* é `AGUARDANDO_APROVACAO` — como essas transições passaram a existir no grafo (para a nova RPC usar), sem essa correção o Planejamento conseguiria "reprovar"/"pedir complementação" por fora, sem gerar linha em `avu_approvals` nem notificação. Passa a buscar o status atual primeiro e bloquear esse par específico para quem não é admin.

### `avu_fiscalizacao_view`

`avus.*` + `latest_decision`/`latest_decision_comment`/`latest_decision_at`/`latest_decision_fiscal_id` via `left join lateral` na última linha de `avu_approvals` (mesmo padrão de `status_since` em `avu_planning_view`). Necessária porque o bucket "Reprovados" da página de Fiscalização **não pode ser um filtro de `status`** — reprovar manda a AVU pra `EM_EXECUCAO`, então só a última decisão registrada diz se aquela AVU foi reprovada.

## Migration `0007_dashboard_executivo.sql`

Dashboard Executivo: índices para os 9 filtros globais e a view que traz `status_since`/`data_conclusao` pros indicadores.

### Índices novos

`categoria`, `local`, `projeto`, `gerencia_responsavel`, `empresa_executante`, `emitente`, `data_criacao` — até aqui só existiam em `status`/`fiscal`/`responsavel`/`data_limite` (Sprint 2). Verificado com `explain analyze` (ver `docs/testing.md`): com a tabela vazia o planner corretamente prefere `Seq Scan` (é mais barato que usar índice em poucas linhas); inserindo 5000 linhas sintéticas dentro de uma transação revertida, o mesmo filtro já usa `Index Scan using avus_gerencia_responsavel_idx`, ~3ms de execução.

### `avu_dashboard_view`

`avus.*` + `status_since` (mesmo cálculo de `avu_planning_view`, repetido aqui pra poder usar `deriveAvuRisk` no ranking de áreas críticas do dashboard) + `data_conclusao` (nova: última linha de `avu_status_history` com `new_status = 'CONCLUIDO'`, usada pro indicador de tempo médio de atendimento — `data_conclusao - data_criacao`, em dias, só nas AVUs concluídas).

## Migration `0008_avu_imports.sql`

Fila de importação inteligente de PDFs (Sprint 9). Ver `docs/architecture.md` ("Importação de PDF e abstração de `AIProvider`") e `docs/testing.md` para o pipeline completo.

- `avu_import_status` enum: `AGUARDANDO | PROCESSANDO | PROCESSADO | ERRO | REVISAO_NECESSARIA`.
- `avu_imports` — uma linha por PDF em processamento. `avu_id` é **nullable**: só é preenchido quando a AVU real é criada (validação automática com confiança ≥ 80%, ou confirmação humana na tela de revisão) — nunca antes, pra não deixar AVU incompleta visível a ninguém nem quebrar a disciplina de FK.
- `avu_import_logs` — um log por passo do pipeline (`UPLOAD`, `OCR`, `EXTRACAO_TEXTO`, `EXTRACAO_CAMPOS`, `EXTRACAO_IMAGENS`, `CLASSIFICACAO_IA`, `VALIDACAO`, `CRIACAO_AVU`), pra transparência na tela de revisão.
- Bucket novo `avu-import-staging` (privado, só PDF, 20MB): arquivo ainda não pertence a nenhuma AVU visível, então a RLS de storage não pode usar `can_view_avu()` aqui — usa a mesma população que pode importar (`is_admin() or has_permission('avus.create')`, igual à régua de `/avus/novo`).
- PDF final e imagens extraídas **não ganham um bucket/tabela novos** — viram `avu_attachments` normais no bucket `avu-attachments` já existente (`kind='document'` pro PDF, `kind='photo'` por imagem), reaproveitando toda a RLS/UI da Sprint 2 (aparecem de graça nas abas Documentos/Fotos do detalhe da AVU). A cópia de bytes do staging pro bucket final não é possível em SQL puro — é feita pela Edge Function, que tem acesso à API de Storage.
- RPC `avu_import_start(p_import_id, p_original_file_name, p_staging_path)` — registra a linha da fila (status `AGUARDANDO`); o `id` é gerado no cliente (mesmo padrão de `avuService.ts`/`evidenceService.ts`) pra já poder montar o path de staging antes desta chamada.
- RPC `avu_import_retry(p_import_id)` — reseta `ERRO` de volta pra `AGUARDANDO`.
- RPC `avu_import_confirm_create_avu(p_import_id, p_fields, p_categoria, p_subcategoria)` — cria a linha real em `avus` a partir dos campos extraídos/editados (só a parte de banco; storage é responsabilidade da Edge Function), grava `audit_logs` + `avu_import_logs`.

## Migration `0009_sap_imports.sql`

Integração SAP (Sprint 9, segunda parte) — importação de arquivos exportados do SAP (CSV/XLSX), **não conexão direta com o SAP** (fora de escopo desta sprint). Ver `docs/architecture.md` ("Integração SAP") e `docs/testing.md` para o fluxo completo.

- `sap_import_status` enum: `PROCESSANDO | PROCESSADO | ERRO`.
- `sap_imports` — uma linha por arquivo importado: `file_name`, `file_type` (`csv`/`xlsx`), `regex_pattern` (o padrão usado nesta importação, gravado para auditoria/reprodutibilidade — não existe uma tabela de configuração separada para isso), contadores (`total_records`/`matched_count`/`unmatched_count`/`duplicate_count`/`error_count`).
- `sap_records` — uma linha por linha do arquivo importado: campos brutos do SAP (`nota`, `om`, `status_sap`, `centro`, `data_planejada`, `data_execucao`, `prioridade_sap`, `descricao` — **nunca confundir com os campos internos de `avus`**, o workflow interno não é sobrescrito por esta importação), `avu_numero_extraido` (via regex, calculado no client), `avu_id` (nullable, `on delete set null`) e `match_status` (`RELACIONADO | AVU_NAO_ENCONTRADO | DUPLICADO | ERRO`).
- `normalize_avu_numero(text)` — remove tudo que não é letra/dígito e uppercasa, para comparar `avus.numero_avu` (formato interno, ex. `AVU-2026-0041`) com o número extraído da descrição do SAP (ex. `AVU2026004155`) por **match exato normalizado** — decisão deliberada por segurança (sem isso, um match "flexível"/`ilike` correria risco de ligar a AVU errada).
- RPC `sap_import_start(p_import_id, p_file_name, p_file_type, p_regex_pattern)` — registra a linha da fila (status `PROCESSANDO`); `id` gerado no cliente, mesmo padrão de `avu_import_start`.
- RPC `sap_import_process_batch(p_import_id, p_records jsonb)` — processa o lote inteiro (já parseado no client — CSV/XLSX não envolve segredo, então **não precisa de Edge Function** aqui, diferente da importação de PDF) numa única chamada: duplicata por `nota` já vista (nesta importação ou em qualquer anterior) → `DUPLICADO`; sem número extraído → `AVU_NAO_ENCONTRADO`; com número mas sem AVU correspondente → `AVU_NAO_ENCONTRADO`; com AVU correspondente → atualiza **apenas** `avus.nota_sap`/`avus.ordem_manutencao` (nunca Status/Prioridade/Datas — essas ficam só em `sap_records`, para referência) e marca `RELACIONADO`. Cada linha tem sua própria captura de exceção (`begin...exception when others...end` aninhada no loop) — uma linha malformada vira `ERRO` sem abortar o lote.
- RPC `sap_import_retry(p_import_id, p_regex_pattern default null)` — reaplica o casamento sobre os `sap_records` já salvos (não reimporta o arquivo); aceita opcionalmente um novo padrão de regex, que fica persistido em `sap_imports.regex_pattern`.
- RLS: mesma régua de `avu_imports` (`is_admin() or has_permission('avus.view_all') or has_permission('avus.create')` para leitura; `is_admin() or has_permission('avus.create')` para escrita).

## Migration `0010_governanca.sql`

Governança/Rastreabilidade (Sprint 10) — auditoria com diff real, log de acesso, novos eventos de notificação e checagem de prazo sob demanda. **Nenhuma tabela nova**: tudo é extensão de `audit_logs`/`notifications` já existentes desde as migrations `0001`/`0006`.

- **`audit_avus_change()` redefinida** — antes gravava só `'avu.updated'` com `metadata=null` para qualquer update que não mudasse `status`; agora compara OLD/NEW campo a campo (`descricao`, `categoria`, `subcategoria`, `local`, `projeto`, `gerencia_responsavel`, `empresa_executante`, `data_limite`, `emitente`, `responsavel`, `fiscal`, `prioridade`, `nota_sap`, `ordem_manutencao`, `latitude`, `longitude`) e grava `metadata = {"changes": {"campo": {"from": ..., "to": ...}}}` só com os campos que de fato mudaram. Se nada relevante mudou (ex.: só `updated_at`), não grava nada — evita ruído. `status` continua fora daqui, responsabilidade de `avu_status_history` (sem mudança).
- **RPC `log_avu_access(p_avu_id)`** — grava `audit_logs` com `action='avu.viewed'` ("quem acessou", não só quem alterou). Só grava se `can_view_avu(p_avu_id)`; nunca lança erro. Chamada pelo frontend uma vez por visualização do detalhe da AVU (`AvuDetailPage.tsx`, com dedupe client-side por sessão — `logAvuAccessOnce` em `auditLogService.ts`).
- **`avu_submit_evidence` redefinida** — mesma validação/transição de sempre, só ganhou um fan-out de notificação pro fiscal responsável ("Nova evidência enviada") ao final.
- **`sap_import_process_batch`/`sap_import_retry` redefinidas** — mesma lógica de casamento/duplicata/atualização de `nota_sap`/`ordem_manutencao` de sempre (migration `0009`), só ganharam um fan-out de notificação ("Nota SAP vinculada") pro fiscal/responsável quando uma linha vira `RELACIONADO`. Em `sap_import_retry`, só notifica quando o vínculo é **novo** (`v_record.avu_id is distinct from v_avu_id`) — evita notificar de novo a cada clique em "Reprocessar" sobre um registro já relacionado à mesma AVU.
- **RPC `avu_generate_deadline_notifications()`** — gera notificações de "Prazo próximo" (≤3 dias, mesmo limiar de `WARNING_THRESHOLD_DAYS` em `src/features/avus/sla.ts`) e "AVU vencida" para fiscal/responsável/contratada de cada AVU com status não-terminal. Idempotente: não duplica a mesma notificação (mesmo título, mesma AVU) dentro de 20h. **Não há `pg_cron` neste projeto** (plano Supabase Free) — a função é chamada sob demanda pelo client (`MainLayout.tsx`, uma vez por sessão com throttle de 6h via `localStorage`, mais um botão manual "Verificar prazos agora" na página de Auditoria). Ver `docs/architecture.md` para o caminho de upgrade (pg_cron real num plano pago, ou Edge Function agendada externamente).

## Convenções para próximas migrations

- Uma migration por mudança de schema coesa, nomeada `NNNN_descricao.sql`.
- Toda tabela nova nasce com RLS habilitado — nunca deixar uma tabela sem policy explícita em produção.
- Chaves estrangeiras para `auth.users`/`profiles` sempre com `on delete` explícito (`cascade` ou `set null`, conforme o caso).
- Tabelas de negócio devem ter `created_at`/`updated_at` e, quando fizer sentido, um vínculo com `audit_logs` (ação registrada via trigger ou explicitamente no service).

## Como aplicar

O projeto já tem um Supabase real configurado em `.env` (ver `.env.example`), mas as migrations **não são aplicadas automaticamente** — não há credenciais de banco (senha/`service_role key`) neste ambiente, e não devem ser coladas em chat por segurança. Aplique manualmente, na ordem, com uma das duas opções:

**Opção 1 — SQL Editor do painel Supabase** (mais simples): cole o conteúdo de `supabase/migrations/0001_init.sql` e rode; depois `0002_rbac_and_invites.sql`; depois `0003_avus.sql`; depois `0004_workflow_and_planning.sql` — nessa ordem.

**Opção 2 — Supabase CLI** (via `npx`, sem instalação global):

```bash
npx supabase login
npx supabase link --project-ref pgllntwbkwqekfamtahk
npx supabase db push
```

Depois de aplicar, siga o "Bootstrap do primeiro admin" acima antes de divulgar a URL de `/cadastro`.
