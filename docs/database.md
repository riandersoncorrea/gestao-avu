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
