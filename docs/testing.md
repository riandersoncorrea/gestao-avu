    # Testes — Gestão de AVU

Duas camadas de teste, porque autorização aqui nunca depende só do frontend:

1. **Automatizados (Vitest)** — lógica pura de permissões e os guards de rota (React). Rodam sem precisar de rede/banco.
2. **Manuais (SQL)** — verificação de RLS direto no Postgres. Não são automatizados nesta sprint porque este ambiente não tem a senha do banco nem a `service_role key` (não devem ser coladas em chat) — o script abaixo deve ser rodado por quem tem acesso ao SQL Editor do projeto.

## Rodando os testes automatizados

```bash
npm run test
```

108 testes em 9 arquivos.

### `src/features/auth/permissions.test.ts`

Testa `derivePermissionSet`/`hasPermission`/`hasRole`/`isAdmin` (funções puras, sem I/O) contra a mesma matriz semeada em `supabase/migrations/0002_rbac_and_invites.sql`: um teste por perfil (Segurança Empresarial, Planejamento, Fiscal, Contratada, Gestor, Leitor, Admin), mais casos de união de múltiplos perfis e entradas vazias/nulas.

### `src/features/auth/ProtectedRoute.test.tsx`

Monta um `MemoryRouter` reproduzindo a estrutura de `app/routes.tsx` (com `useAuth` mockado) e cobre, ponto a ponto, o que foi pedido:

| Cenário pedido | Teste |
|---|---|
| Usuário sem autenticação | `RequireAuth > redireciona para /login um usuário sem autenticação...` |
| Usuário autenticado | `RequireAuth > renderiza a rota para um usuário autenticado` |
| Cada perfil | `RequirePermission — cada perfil` (`it.each` nos 7 perfis, contra a rota `/avus` que exige `avus.view_all`) |
| Acesso indevido | `RequireAdmin — acesso indevido > redireciona para /acesso-negado...` |
| Tentativa de acesso direto à URL | `RequireAuth > tentativa de acesso direto à URL de administração sem sessão...` — usa `initialEntries` do `MemoryRouter` para simular abrir a URL direto, sem navegar pela UI |

O mesmo arquivo ganhou (Sprint 2) `RequirePermission — criação de AVU (avus.create)`: `it.each` nos 7 perfis contra `/avus/novo`, confirmando que só Admin e Segurança Empresarial passam (Planejamento, que só visualiza, é barrado), mais o caso de acesso direto à URL sem sessão.

### `src/features/avus/sla.test.ts` e `src/features/avus/permissions.test.ts` (Sprint 2)

`sla.ts` (`computeSlaStatus`/`daysUntilDue`/`daysOverdue`) testado com datas fixas (`REFERENCE`), cobrindo os 4 indicadores pedidos (no prazo, próximo do vencimento, vencido, encerrado) — inclusive a regra de status terminal sempre virar "encerrado" mesmo com data vencida. `permissions.ts` (`canWriteAvuRelated`) testa a mesma matriz de "quem pode escrever" usada na UI para esconder o formulário de comentário do Leitor.

### `src/features/planning/transitions.test.ts`, `kanbanColumn.test.ts` e `src/features/avus/risk.test.ts` (Sprint 3)

`transitions.ts` testa o grafo inteiro espelhado de `avu_status_transitions`: cada passo do caminho feliz (`NOVO→TRIAGEM→...→CONCLUIDO`), `CANCELADO` alcançável de qualquer status ativo, `REPROVADO→EM_EXECUCAO` (retrabalho), transições que pulam etapa (ex.: `NOVO→CONCLUIDO`) devolvendo `false`, e que `getPlanningNextStatuses` exclui os alvos reservados a Fiscal/Contratada (`AGUARDANDO_APROVACAO`/`CONCLUIDO`/`REPROVADO`, exceto `CANCELADO` que continua liberado). `kanbanColumn.ts` testa as 11 colunas: as 5 derivadas de nota/OM/prazo, as 4 de status direto, `VENCIDO` sobrepondo qualquer coluna quando atrasado (menos `CONCLUIDO`), e `CANCELADO`/`REPROVADO` fora do quadro (`null`). `risk.ts` testa a matriz SLA×prioridade×tempo parado nos 4 níveis e a regra de status terminal sempre "Baixo".

## Verificação manual de RLS (SQL Editor do Supabase)

Rode isto **depois** de aplicar as duas migrations e criar pelo menos um usuário de cada perfil (via `/cadastro` + convite). Cada bloco simula a sessão de um usuário específico dentro de uma transação que é sempre desfeita (`rollback`), então é seguro rodar em produção.

```sql
-- 1) Descubra o id de um usuário de cada perfil para substituir abaixo.
select p.id, p.email, r.name as role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
join public.roles r on r.id = ur.role_id
order by r.name;
```

```sql
-- 2) Template: rode um bloco destes por perfil, trocando <USER_ID>.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_ID>', 'role', 'authenticated')::text, true);
set local role authenticated;

-- deve retornar linhas (RLS permite leitura para qualquer autenticado):
select * from public.roles;
select * from public.permissions;
select * from public.profiles;

-- só deve retornar linha(s) se <USER_ID> for admin (senão, vazio):
select * from public.user_invites;

-- só deve retornar as próprias linhas de user_roles, a menos que seja admin:
select * from public.user_roles;

-- tentativa de acesso indevido — deve FALHAR (exception) para qualquer perfil que não seja admin:
select public.admin_set_user_active('<OUTRO_USER_ID>', false);

rollback;
```

```sql
-- 3) Usuário sem autenticação (papel "anon" do PostgREST) — tudo abaixo deve vir vazio,
-- exceto o que explicitamente tiver policy "to anon" (nenhuma tabela desta sprint tem).
begin;
set local role anon;
select * from public.profiles;   -- vazio
select * from public.roles;      -- vazio
select * from public.user_invites; -- vazio
rollback;
```

### Checklist esperado por perfil

| Perfil | `roles`/`permissions` (leitura) | `profiles` (leitura) | `user_invites` | `admin_set_user_roles`/`admin_set_user_active` |
|---|---|---|---|---|
| Sem autenticação (anon) | ❌ vazio | ❌ vazio | ❌ vazio | ❌ erro |
| Qualquer perfil autenticado | ✅ | ✅ (diretório completo) | ❌ vazio (exceto admin) | ❌ erro (exceto admin) |
| Admin | ✅ | ✅ | ✅ | ✅ |

### Tentativa de cadastro sem convite (bloqueio no banco)

Para confirmar que `handle_new_user()` bloqueia e-mails sem convite: acesse `/cadastro` com um e-mail que **não** tenha um `user_invites` pendente (e que não seja o bootstrap do primeiro admin) — o cadastro deve falhar com a mensagem "Este e-mail não tem um convite pendente...". Isso prova que a validação está no Postgres (a chamada `auth.signUp()` falha antes mesmo de criar o usuário), não só escondida na UI.

## Verificação manual de RLS de AVUs (Sprint 2)

Pré-requisito: pelo menos um usuário de cada perfil (Fiscal, Contratada, Gestor, Segurança Empresarial, Leitor), com `profiles.company_name`/`profiles.area` preenchidos para o Contratada/Gestor de teste, e pelo menos duas AVUs — uma atribuída a esse Fiscal/Contratada/Gestor de teste, outra não.

```sql
-- 0) Setup de dados de teste (ajuste os e-mails para os seus usuários reais).
update public.profiles set company_name = 'Contratada Teste Ltda' where email = '<email-da-contratada>';
update public.profiles set area = 'Manutenção Norte' where email = '<email-do-gestor>';

insert into public.avus (descricao, gerencia_responsavel, empresa_executante, fiscal, status)
values
  ('AVU de teste — atribuída', 'Manutenção Norte', 'Contratada Teste Ltda',
   (select id from public.profiles where email = '<email-do-fiscal>'), 'EM_EXECUCAO'),
  ('AVU de teste — não atribuída', 'Outra Gerência', 'Outra Empresa', null, 'NOVO');
```

```sql
-- 1) Fiscal só vê a AVU onde fiscal = seu id.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DO_FISCAL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select numero_avu, descricao from public.avus; -- só a "atribuída"
rollback;
```

```sql
-- 2) Contratada só vê a AVU da própria empresa.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DA_CONTRATADA>', 'role', 'authenticated')::text, true);
set local role authenticated;
select numero_avu, descricao from public.avus; -- só a de "Contratada Teste Ltda"
rollback;
```

```sql
-- 3) Gestor só vê a AVU da própria área.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DO_GESTOR>', 'role', 'authenticated')::text, true);
set local role authenticated;
select numero_avu, descricao from public.avus; -- só a de "Manutenção Norte"
rollback;
```

```sql
-- 4) Leitor vê tudo, mas não comenta (só leitura de verdade).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DO_LEITOR>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.avus; -- vê as duas
insert into public.avu_comments (avu_id, author_id, body)
values ((select id from public.avus limit 1), '<ID_DO_LEITOR>', 'tentando comentar');
-- ↑ deve FALHAR (RLS bloqueia insert — Leitor não tem avus.view_all/view_assigned/view_area)
rollback;
```

```sql
-- 5) Acesso indevido às RPCs — cada uma só funciona para o perfil certo.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DO_FISCAL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_submit_evidence((select id from public.avus limit 1), null);
-- ↑ deve FALHAR: só Contratada pode enviar evidência, não Fiscal
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DA_CONTRATADA>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_review_execution((select id from public.avus limit 1), true, null);
-- ↑ deve FALHAR: só o Fiscal atribuído (ou admin) pode aprovar/reprovar
rollback;
```

```sql
-- 6) Quem não tem avus.create não consegue criar AVU (ex.: Fiscal, Gestor, Leitor).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DO_FISCAL>', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.avus (descricao) values ('tentando criar sem permissão');
-- ↑ deve FALHAR (RLS de insert exige avus.create)
rollback;
```

### Checklist esperado — AVUs

| Perfil | `select avus` | `insert avus` | `avu_submit_evidence` | `avu_review_execution` |
|---|---|---|---|---|
| Fiscal | só as atribuídas a si | ❌ | ❌ | ✅ só as atribuídas a si |
| Contratada | só as da própria empresa | ❌ | ✅ só as da própria empresa | ❌ |
| Gestor | só as da própria área | ❌ | ❌ | ❌ |
| Segurança Empresarial / Planejamento | todas | ✅ (só Segurança Empresarial) | ❌ | ❌ |
| Leitor | todas | ❌ | ❌ | ❌ |
| Admin | todas | ✅ | ✅ | ✅ |

## Verificação manual de transições de status (Sprint 3)

Pré-requisito: pelo menos uma AVU de teste e um usuário Fiscal (pode reaproveitar o script da seção anterior). Todos os blocos usam `rollback` — seguro em produção.

```sql
-- 1) Pular etapa deve FALHAR mesmo com UPDATE direto (não só pela RPC) — usando o próprio
-- usuário admin/postgres do SQL Editor, sem impersonar ninguém: o trigger vale para qualquer role.
begin;
update public.avus set status = 'CONCLUIDO'
where id = (select id from public.avus where status = 'NOVO' limit 1);
-- ↑ deve FALHAR: ERROR "Transição de status inválida: NOVO → CONCLUIDO" (a menos que a sessão seja admin)
rollback;
```

```sql
-- 2) Fiscal não pode usar a RPC genérica de planejamento (não tem avus.create/planning.manage).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_DO_FISCAL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_transition_status((select id from public.avus where status = 'NOVO' limit 1), 'TRIAGEM', null);
-- ↑ deve FALHAR: "Você não tem permissão para alterar o status desta AVU"
rollback;
```

```sql
-- 3) Segurança Empresarial/Planejamento não pode usar a RPC genérica para os alvos
-- reservados a Fiscal/Contratada (mesmo tendo avus.create/planning.manage).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_SEGURANCA_EMPRESARIAL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_transition_status(
  (select id from public.avus where status = 'AGUARDANDO_EVIDENCIAS' limit 1),
  'AGUARDANDO_APROVACAO',
  null
);
-- ↑ deve FALHAR: "Use avu_submit_evidence/avu_review_execution para esta transição"
rollback;
```

```sql
-- 4) Transição válida pela RPC genérica funciona e grava em avu_status_history com comentário.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_SEGURANCA_EMPRESARIAL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_transition_status(
  (select id from public.avus where status = 'NOVO' limit 1),
  'TRIAGEM',
  'movendo para triagem — teste'
);
select previous_status, new_status, comment from public.avu_status_history order by created_at desc limit 1;
-- ↑ deve mostrar previous_status=NOVO, new_status=TRIAGEM, comment='movendo para triagem — teste'
rollback;
```

### Checklist esperado — transições

| Cenário | Resultado esperado |
|---|---|
| `UPDATE` direto pulando etapa (ex.: NOVO → CONCLUIDO) | ❌ erro do trigger, para qualquer perfil não-admin |
| Fiscal chamando `avu_transition_status` | ❌ erro (sem `avus.create`/`planning.manage`) |
| Segurança Empresarial/Planejamento chamando `avu_transition_status` para `AGUARDANDO_APROVACAO`/`CONCLUIDO`/`REPROVADO` | ❌ erro (reservado às RPCs de Fiscal/Contratada) |
| Segurança Empresarial/Planejamento chamando `avu_transition_status` para uma transição válida do caminho de planejamento | ✅ sucesso, registrado em `avu_status_history` com comentário |
| Admin | ✅ qualquer transição, inclusive pulando etapas (bypass do trigger) |

### `src/features/contractors/evidenceTipo.test.ts` e `portalService.test.ts` (Sprint 4)

`detectEvidenceTipo` testa o mapeamento de MIME type (`image/*→foto`, `video/*→video`, resto→`documento`). `getPortalDashboardStats` testa os 6 indicadores do dashboard com uma lista fixa de AVUs cobrindo cada bucket (pendente/em execução/aguardando evidências/concluído/vencido), mais o caso de lista vazia.

## Verificação manual do Portal da Contratada (Sprint 4)

Pré-requisito: uma AVU de teste com `empresa_executante` preenchida e um usuário Contratada dessa mesma empresa. Todos os blocos usam `rollback` — seguro em produção.

```sql
-- 1) Acesso indevido: Contratada da empresa A não enxerga nem insere evidência
-- em AVU atribuída à empresa B.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_CONTRATADA_EMPRESA_A>', 'role', 'authenticated')::text, true);
set local role authenticated;
select * from public.avu_evidences where avu_id = '<ID_AVU_DA_EMPRESA_B>';
-- ↑ deve retornar 0 linhas (RLS de select bloqueia can_view_avu)
insert into public.avu_evidences (avu_id, tipo, arquivo, nome_arquivo, usuario)
values ('<ID_AVU_DA_EMPRESA_B>', 'foto', 'avus/x/evidences/teste.jpg', 'teste.jpg', '<ID_CONTRATADA_EMPRESA_A>');
-- ↑ deve FALHAR: violação da policy de insert
rollback;
```

```sql
-- 2) Fiscal/Admin conseguem ver evidências de qualquer AVU que já enxergam
-- (mesmo sem poder inserir).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_FISCAL_DA_AVU>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.avu_evidences where avu_id = '<ID_AVU_ATRIBUIDA_AO_FISCAL>';
-- ↑ deve retornar as evidências já enviadas pela Contratada
insert into public.avu_evidences (avu_id, tipo, arquivo, nome_arquivo, usuario)
values ('<ID_AVU_ATRIBUIDA_AO_FISCAL>', 'foto', 'avus/x/evidences/teste.jpg', 'teste.jpg', '<ID_FISCAL_DA_AVU>');
-- ↑ deve FALHAR: Fiscal não tem has_role('contratada') nem is_admin()
rollback;
```

```sql
-- 3) avu_submit_evidence exige ao menos uma evidência anexada.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_CONTRATADA>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_submit_evidence('<ID_AVU_SEM_NENHUMA_EVIDENCIA>', null);
-- ↑ deve FALHAR: "Envie ao menos uma evidência (foto, vídeo ou documento) antes de submeter para aprovação"
rollback;
```

```sql
-- 4) Timeline: Contratada agora vê "AVU criada" mesmo não tendo sido ela quem criou.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_CONTRATADA>', 'role', 'authenticated')::text, true);
set local role authenticated;
select action, entity_id from public.audit_logs
where entity = 'avus' and entity_id = '<ID_AVU_DA_CONTRATADA>' and action = 'avu.created';
-- ↑ antes da migration 0005, retornava 0 linhas (RLS só deixava ver o próprio ator); agora retorna 1
rollback;
```

### Checklist esperado — Portal da Contratada

| Cenário | Resultado esperado |
|---|---|
| Contratada da empresa A lendo/inserindo evidência de AVU da empresa B | ❌ bloqueado pela RLS (select e insert) |
| Fiscal/Admin lendo evidências de uma AVU que já enxergam | ✅ leitura liberada |
| Fiscal (ou qualquer não-Contratada/não-admin) inserindo evidência | ❌ bloqueado (insert restrito a Contratada/admin, mais estrito que `avu_attachments`) |
| `avu_submit_evidence` sem nenhuma evidência anexada | ❌ erro explícito |
| Contratada acessando "AVU criada" no histórico de uma AVU própria | ✅ visível (correção da RLS de `audit_logs`) |
| Upload real (navegador, logado como Admin — que bypassa a restrição de insert) | ✅ arquivo aparece em `avu_evidences`/Storage, com GPS/equipe/equipamentos preenchidos |
| Usuário só-Contratada acessando `/` | ✅ redirecionado para `/portal` |
| Usuário não-Contratada/não-admin acessando `/portal` | ✅ redirecionado para `/` |
