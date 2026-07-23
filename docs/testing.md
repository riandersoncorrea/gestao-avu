    # Testes — Gestão de AVU

Duas camadas de teste, porque autorização aqui nunca depende só do frontend:

1. **Automatizados (Vitest)** — lógica pura de permissões e os guards de rota (React). Rodam sem precisar de rede/banco.
2. **Manuais (SQL)** — verificação de RLS direto no Postgres. Não são automatizados nesta sprint porque este ambiente não tem a senha do banco nem a `service_role key` (não devem ser coladas em chat) — o script abaixo deve ser rodado por quem tem acesso ao SQL Editor do projeto.

## Rodando os testes automatizados

```bash
npm run test
```

137 testes em 11 arquivos.

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

### `src/features/inspections/approvalService.test.ts` (Sprint 5)

`mapBucketToQuery` testa a tradução dos 4 buckets da fila de Fiscalização: 3 são filtro de `status` (`aguardando_aprovacao`, `aguardando_complementacao`, `aprovados`); "Reprovados" é o único que usa `latestDecision` em vez de `status`, porque reprovar manda a AVU para `EM_EXECUCAO`, não para o status `REPROVADO`.

## Verificação manual do módulo de Fiscalização (Sprint 5)

Pré-requisito: pelo menos uma AVU com `status = 'AGUARDANDO_APROVACAO'` e um usuário Fiscal. Todos os blocos usam `rollback` — seguro em produção.

```sql
-- 1) Decisão 'aprovado' -> CONCLUIDO + linha em avu_approvals.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_FISCAL_RESPONSAVEL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_review_evidence('<ID_AVU_AGUARDANDO_APROVACAO>', 'aprovado', 'ok, aprovado');
select status, (select count(*) from public.avu_approvals where avu_id = avus.id and decision = 'aprovado')
from public.avus where id = '<ID_AVU_AGUARDANDO_APROVACAO>';
-- ↑ deve mostrar status=CONCLUIDO e count=1
rollback;
```

```sql
-- 2) Decisão 'reprovado' -> EM_EXECUCAO (NÃO o status REPROVADO).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_FISCAL_RESPONSAVEL>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_review_evidence('<ID_AVU_AGUARDANDO_APROVACAO>', 'reprovado', 'reprovado, falta evidência');
select status from public.avus where id = '<ID_AVU_AGUARDANDO_APROVACAO>';
-- ↑ deve mostrar status=EM_EXECUCAO
rollback;
```

```sql
-- 3) Fiscal que NÃO é o responsável (avu.fiscal is null ou de outra pessoa) -> bloqueado.
-- Este é o teste que pegou o bug de lógica de três valores do PL/pgSQL: antes da correção
-- (v_avu.fiscal is not null and ...), esta chamada passava sem erro quando fiscal era null.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_FISCAL_QUALQUER>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_review_evidence('<ID_AVU_SEM_FISCAL_OU_DE_OUTRO_FISCAL>', 'aprovado', null);
-- ↑ deve FALHAR: "Apenas o fiscal responsável pode analisar esta AVU"
rollback;
```

```sql
-- 4) avu_transition_status: Planejamento tentando pular AGUARDANDO_APROVACAO -> EM_EXECUCAO
-- direto, por fora do avu_review_evidence (bypassaria avu_approvals e as notificações).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<ID_PLANEJAMENTO>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.avu_transition_status('<ID_AVU_AGUARDANDO_APROVACAO>', 'EM_EXECUCAO', null);
-- ↑ deve FALHAR: "Use avu_review_evidence para esta transição"
rollback;
```

```sql
-- 5) notifications RLS: cada usuário só vê as próprias linhas.
begin;
insert into public.notifications (user_id, title, body) values ('<ID_QUALQUER_USUARIO>', 'teste', 'corpo');
select set_config('request.jwt.claims', json_build_object('sub', '<ID_QUALQUER_USUARIO>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.notifications where title = 'teste'; -- deve ser 1
select set_config('request.jwt.claims', json_build_object('sub', '<OUTRO_ID_QUALQUER>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.notifications where title = 'teste'; -- deve ser 0
rollback;
```

### Checklist esperado — Fiscalização

| Cenário | Resultado esperado |
|---|---|
| Fiscal responsável aprova | ✅ status=CONCLUIDO, linha em `avu_approvals`, notificações fanned out |
| Fiscal responsável reprova | ✅ status=EM_EXECUCAO (não REPROVADO) |
| Fiscal responsável solicita complementação | ✅ status=AGUARDANDO_EVIDENCIAS |
| Fiscal sem `avu.fiscal` correspondente (incluindo `fiscal is null`) | ❌ bloqueado — cobre o bug de três valores encontrado e corrigido nesta sprint |
| Planejamento chamando `avu_transition_status` de AGUARDANDO_APROVACAO para EM_EXECUCAO/AGUARDANDO_EVIDENCIAS | ❌ bloqueado (reservado a `avu_review_evidence`) |
| `notifications` — outro usuário lendo a notificação de alguém | ❌ 0 linhas (RLS) |
| Bucket "Reprovados" da fila | ✅ usa `latest_decision`, não `status` (reprovar não passa por `REPROVADO`) |

### `src/features/dashboard/analytics.test.ts` (Sprint 6)

22 testes cobrindo todas as funções puras: `avuMatchesBucket` (um caso por bucket, incluindo `sem_planejamento` com nota/OM parcialmente preenchidas e `vencidos`/`proximos_vencimento` via SLA), `computeKpis` (contagem sobre lista mista), `computeAverageCycleTimeDays`/`computeAverageCycleTimeByGroup` (fixture com `dataCriacao`/`dataConclusao` conhecidos — pegou um bug real de fuso horário, ver abaixo), `groupCount` (ordenação + corte em topN + valores nulos ignorados), `computeCriticalAreasRanking` (reaproveita `deriveAvuRisk`), `computeTemporalSeries` (agrupamento por mês), `computeHeatmapPoints`.

**Bug de fuso horário encontrado e corrigido nesta sprint**: `cycleTimeDays` comparava `dataCriacao` (uma `date` pura, parseada como hora local — `new Date('2026-01-01T00:00:00')`, sem `Z`) com `dataConclusao` (um `timestamptz` do Postgres, com offset/`Z`). Num fuso diferente de UTC isso produz um desvio de horas no "tempo médio de atendimento". Corrigido ancorando as duas datas em UTC explicitamente (`T00:00:00Z`).

## Verificação de performance do Dashboard Executivo (Sprint 6)

Aplicada a migration `0007` (7 índices novos + `avu_dashboard_view`), confirmado com `explain analyze`:

```sql
-- Com a tabela avus vazia, o planner corretamente prefere Seq Scan (mais barato que
-- usar índice em poucas linhas) — não é um problema dos índices, é o comportamento
-- esperado do otimizador de custo do Postgres.
explain analyze
select * from public.avu_dashboard_view
where categoria = 'Elétrica' and gerencia_responsavel = 'Manutenção' and data_criacao >= '2026-01-01';
-- ↑ Seq Scan on avus a
```

```sql
-- Com 5000 linhas sintéticas (inseridas e revertidas na mesma transação — begin/rollback,
-- nada fica no banco), o mesmo filtro já usa o índice novo:
begin;
insert into public.avus (descricao, categoria, gerencia_responsavel, local, projeto, empresa_executante, data_criacao, status)
select
  'AVU sintética de teste de performance ' || i,
  (array['Elétrica','Mecânica','Civil','Instrumentação','Estrutural'])[1 + (i % 5)],
  (array['Manutenção','Operações','Engenharia','Segurança'])[1 + (i % 4)],
  (array['Pátio A','Pátio B','Oficina','Terminal'])[1 + (i % 4)],
  (array['Projeto Norte','Projeto Sul','Projeto Central'])[1 + (i % 3)],
  (array['Empresa Alfa','Empresa Beta','Empresa Gama'])[1 + (i % 3)],
  (current_date - (i % 400)),
  (array['NOVO','TRIAGEM','PLANEJAMENTO','PROGRAMADO','EM_EXECUCAO','CONCLUIDO'])[1 + (i % 6)]::public.avu_status
from generate_series(1, 5000) as i;

explain analyze
select * from public.avu_dashboard_view
where categoria = 'Elétrica' and gerencia_responsavel = 'Manutenção' and data_criacao >= current_date - 400;
-- ↑ Index Scan using avus_gerencia_responsavel_idx on avus a
--   (actual time=0.033..0.805 rows=250 loops=1) — consulta inteira em ~3.4ms

rollback;
```

### Checklist esperado — Dashboard Executivo

| Cenário | Resultado esperado |
|---|---|
| Índices (`categoria`/`local`/`projeto`/`gerencia_responsavel`/`empresa_executante`/`emitente`/`data_criacao`) existem | ✅ confirmado via `pg_indexes` |
| Filtro combinado sob volume realista (5000 linhas sintéticas) | ✅ `Index Scan`, não `Seq Scan`; consulta em poucos ms |
| `avuMatchesBucket` usado tanto pra contar KPI quanto pra filtrar `/avus` (drill-down) | ✅ mesma função, sem lógica duplicada |
| 9 filtros globais atualizando todos os indicadores juntos | ✅ um único fetch (`listAvusForDashboard`) alimenta tudo |

### `src/features/gis/markerColor.test.ts` (Sprint 7)

15 testes: um por status "puro" mapeado pra sua cor (Novo/Triagem/Planejamento → cinza, Programado → azul, Em Execução/Aguardando Evidências/Aguardando Aprovação → laranja, Concluído → verde), mais os casos de precedência — SLA `vencido` sobrepõe Programado e Em Execução (vira vermelho), SLA `proximo_vencimento` sobrepõe o status bruto (vira amarelo), Concluído nunca aparece como atrasado mesmo com `dataLimite` no passado (status terminal → SLA `encerrado`, sem conflito), Cancelada/Reprovada retornam `null` (fora do mapa), e o caso sem `dataLimite`.

## Verificação manual do mapa de vulnerabilidades (Sprint 7)

Sem migration nova (reaproveita `avu_dashboard_view` da Sprint 6). Testado inserindo, via SQL Editor, 8 AVUs individuais cobrindo cada cor/caso-limite (uma por status-alvo, uma sem `latitude`/`longitude`, uma `CANCELADO`) mais um lote sintético de 30 pontos próximos entre si (mesma técnica de `insert`/`delete` das sprints anteriores, sem transação revertida desta vez porque o teste também precisava validar via app logado — os dados foram apagados manualmente ao final com `delete ... where numero_avu like 'AVU-GIS%'`).

| Cenário pedido | Resultado |
|---|---|
| Cada cor de marcador (Cinza/Azul/Laranja/Verde/Vermelho/Amarelo) | ✅ confirmado visualmente, uma AVU de teste por cor |
| AVU sem coordenadas | ✅ fora do mapa, presente na tabela |
| AVU Cancelada | ✅ fora do mapa, presente na tabela |
| Clique no marcador → painel lateral | ✅ número/fotos/descrição/categoria/responsável/prazo/status/OM/nota/empresa/fiscal corretos |
| "Abrir detalhes" no painel | ✅ navega para `/avus/:id` |
| Clique numa AVU na tabela → mapa centraliza | ✅ `flyTo` funciona, marcador realçado (`circle-stroke`) |
| Clustering com muitos pontos próximos (30 sintéticos) | ✅ agrupa em bolha com contagem, expande em zoom progressivo até virar pontos individuais |
| 9 filtros atualizando mapa + tabela juntos | ✅ testado com filtro de Status; mapa e tabela convergem pro mesmo subconjunto |
| Toggle Marcadores ↔ Mapa de calor | ✅ (depois do fix de vazamento de camada, ver abaixo) alterna limpo, sem sobreposição |
| Responsividade mobile (390×844) | ✅ filtros empilham em coluna única, painel lateral vira drawer full-width com backdrop |

**Dois bugs encontrados e corrigidos nesta verificação** (nenhum deles no `markerColor.ts`, que já estava correto e testado — os dois eram em `BaseMap.tsx`):

1. **Clustering nunca renderizava.** `BaseMap` esperava `map.isStyleLoaded()`/evento `load` do MapLibre antes de adicionar a fonte GeoJSON clusterizada — mas esse evento só dispara quando **todos** os tiles/glyphs do style base terminam de carregar, o que pode nunca acontecer numa rede lenta/instável (confirmado com `map.style._loaded === true` mas `map.isStyleLoaded() === false` minutos depois, e `map.addSource(...)` funcionando normalmente quando chamado direto). O mesmo padrão já existia no mapa de calor desde a Sprint 6. Corrigido: as duas camadas tentam adicionar a fonte direto (dentro de um `try/catch`) e, se o style ainda não aceitar, tentam de novo no próximo evento `styledata` — sem depender de `load`.
2. **Vazamento de camada ao trocar de aba.** Alternar Marcadores → Mapa de calor não removia a camada de clustering anterior (e vice-versa), deixando as duas sobrepostas no mapa. Corrigido: cada efeito (`heatmapPoints`/`clusteredMarkers`) agora remove sua própria fonte/camadas quando a prop correspondente deixa de ser passada.

## `supabase/functions/process-avu-import/lib/*.test.ts` (Sprint 9 — importação de PDF; reescrito e validado contra PDF real numa sprint posterior)

19 testes cobrindo as três peças de lógica pura do pipeline (sem `Deno.*`, testáveis via Vitest a partir do frontend mesmo vivendo em `supabase/functions/`):

- **`extractFields.test.ts`** (11 testes): extração de todos os campos a partir de uma fixture estruturalmente idêntica a um PDF de AVU real (rótulo numa linha, valor na linha seguinte — ver "Causa raiz" abaixo); número da AVU extraído por padrão (`AVU\d+`), não por rótulo; "Gerência" (código curto) não é confundido com "Gerência Responsável pelo tratamento" (regressão de um bug real de prefixo); "Emitentes" (plural, como no modelo real) reconhecido sem truncar; rótulo de duas linhas ("Data Limite de" / "Resolução") reconhecido; data com hora junto ("Criada em" → "17/04/2026 08:40") extrai só a data; descrição para no próximo rótulo conhecido; todos os 10 campos pedidos contam como faltando quando nenhum rótulo bate; datas ISO aceitas diretamente; datas em formato não reconhecido retornam `null` e contam como faltando; texto vazio não lança exceção.
- **`classify.test.ts`** (8 testes): `HeuristicAIProvider` classifica corretamente casos claros de cada categoria/subcategoria da taxonomia real (Roço/Capina/Poda/Árvores/Vegetação/Mato/Supressão Vegetal, Muros/Cercas/Concertina/Portões, Poste/Luminária/Refletor/Fotocélula/Cabo); inclui a descrição de uma AVU real ("Vegetação alta"/"roço") como caso de teste; cai em OUTROS sem palavra-chave; nunca ultrapassa o teto de confiança do classificador heurístico; é determinístico.
- **`pdf.ts`/`pngEncoder.ts`/`ocr.ts`**: usam `npm:`/`Deno.*` (só rodam no runtime Deno da Edge Function) — sem cobertura Vitest, verificados manualmente rodando via `deno run` local contra um PDF real (ver abaixo).

## Verificação manual da importação de PDF — causa raiz do bug relatado e correção completa

**Contexto**: um usuário relatou que uma importação de PDF real falhou ("o sistema não conseguiu extrair corretamente as informações necessárias"). A Sprint 9 original (acima) nunca tinha sido validada contra um PDF real nem publicada em produção — os dois fatos considerados, juntos, description a causa completa.

**Causa raiz nº 1 — a Edge Function nunca tinha sido publicada.** Consultado o único registro real em `avu_imports` (`AVU2026004155.pdf`, criado antes desta correção): `status = ERRO`, `error_message` começando com `FunctionsFetchError: Failed to send a request to...`. Confirmado via `npx supabase functions list --project-ref pgllntwbkwqekfamtahk` → `{"functions":[]}`. O PDF original ainda estava no bucket `avu-import-staging` (nunca processado, então nunca removido) — baixado (`npx supabase storage cp ... --linked --experimental`) e usado como amostra real para todo o resto desta verificação.

**Causa raiz nº 2 — mesmo publicada, a extração de texto falhava 100% das vezes.** Rodando `extractPdfText` (com `mergePages: true`, como a função original fazia) contra o PDF real via `deno run` local: o texto inteiro do documento de 3 páginas vira **uma única linha** (todas as quebras de linha somem, viram espaço) — e `extractFields.ts` original dependia inteiramente de regex `^rótulo...valor$` ancoradas em quebra de linha. Como não existe nenhuma quebra de linha no texto extraído dessa forma, **nenhum campo é encontrado, nunca**. Corrigido em `pdf.ts` extraindo com `mergePages: false` (preserva `\n` por página) e juntando as páginas manualmente.

**Causa raiz nº 3 — mesmo com o texto corrigido, a extração de campos assumia o formato errado.** O modelo real (confirmado com o PDF de produção) não usa "Rótulo: valor" numa linha — usa **rótulo numa linha inteira, valor na linha seguinte**, sem dois-pontos (ex.: `"Gerência Responsável pelo tratamento\nGER FACILITIES SAO LUIZ EFC - RAFAEL PEREIRA OLIVEIRA"`). `extractFields.ts` foi reescrito do zero pra esse formato. Dois bugs adicionais de correspondência por prefixo foram encontrados e testados como regressão: (a) o rótulo curto "Gerência" (código, ex. `GALNR`) e o rótulo completo "Gerência Responsável pelo tratamento" são campos **distintos** no mesmo documento — o algoritmo antigo de regex por prefixo confundia os dois; (b) o rótulo real é "**Emitentes**" (plural) — o código antigo só reconhecia "Emitente" (singular) e, por prefixo, capturava só a letra "s" sobrando como valor.

**Causa raiz nº 4 — extração de imagens nunca funcionou, por dois motivos técnicos distintos, ambos confirmados rodando contra o PDF real:**
1. `page.OPS` (usado pra identificar o operador gráfico "pintar imagem") **não existe** no objeto de página exposto pela lib `unpdf` — sempre `undefined`, então o filtro nunca batia com nada, silenciosamente (zero imagens, zero avisos, nenhum erro). Corrigido acessando o enum `OPS` real via `resolvePDFJS()`.
2. Mesmo com o operador de imagem localizado, `page.objs.get()` do pdf.js entrega a imagem **já decodificada como pixels crus** (RGB, sem compressão) — nunca os bytes originais do stream, então checar magic bytes de JPEG (`0xFFD8`, o que o código original fazia) nunca é verdadeiro pra nenhuma imagem, de forma alguma. As 3 fotos reais de "Anexos" do PDF de teste (confirmadas como `enc=jpeg` no arquivo via `pdfimages -list`) chegam nessa API como `kind=RGB_24BPP`. Corrigido escrevendo um encoder de PNG mínimo, sem dependência (`pngEncoder.ts`, só usa `CompressionStream('deflate')`, uma Web API padrão), que re-codifica qualquer buffer de pixels RGB como PNG — funciona independente do formato original. Imagens RGBA (com transparência — o logo do cabeçalho do PDF real é `kind=RGBA_32BPP`, já que fotos JPEG de câmera nunca têm canal alfa) são deliberadamente ignoradas por não serem fotos de vulnerabilidade.

**Causa raiz nº 5 — bucket de staging rejeitava as imagens.** Depois de corrigir a extração de imagem, a Edge Function passou a subir as imagens extraídas pro bucket `avu-import-staging` (pra tela de revisão mostrar miniaturas antes da confirmação) — mas esse bucket foi criado (migration `0008`) com `allowed_mime_types = ['application/pdf']` só. Todo upload de imagem (`image/png`) era rejeitado pelo Storage, e o erro era descartado silenciosamente em `stageExtractedImages` (só um `if (!error) push(...)`, sem log do lado contrário) — confirmado ao testar de ponta a ponta pela primeira vez em produção: a tela de revisão mostrava "0 imagem(ns) encontrada(s)" mesmo com o log de processamento dizendo "3 imagem(ns) extraída(s)" (a mensagem de log usava a contagem de imagens *extraídas do PDF*, não a de imagens que *realmente subiram pro Storage* — outro bug, corrigido junto). `allowed_mime_types` do bucket atualizado via migration `0012` para incluir `image/png`/`image/jpeg`.

**Verificação de ponta a ponta contra o PDF real, em produção, depois de todas as correções e deploys:**

| Cenário pedido | Resultado |
|---|---|
| Migration `0011` (miniaturas + checagem de duplicidade) e `0012` (MIME do bucket) | ✅ aplicadas via SQL Editor (o `supabase db push` tentou reaplicar todo o histórico desde `0001` porque o ledger de migrations do CLI nunca foi inicializado neste projeto — nenhuma migration tinha sido aplicada por ele antes; abortou com segurança na primeira, sem alterar nada, já que cada migration roda em transação própria) |
| Deploy da Edge Function corrigida | ✅ `npx supabase functions deploy process-avu-import` — confirmado `ACTIVE` via `supabase functions list` |
| Upload do PDF real (o mesmo arquivo da tentativa original que falhou) pela UI de produção | ✅ status foi de `Aguardando` → `Processando` → `Revisão necessária` (confiança do classificador heurístico, 64%, abaixo do limiar de 80% — comportamento esperado sem `OPENAI_API_KEY` configurada) |
| Extração de todos os 10 campos | ✅ Número AVU, Data de criação, Gerência responsável, Data limite, Emitente, Projeto, Local, Latitude, Longitude e Descrição — todos corretos, `missingFields: []` |
| Extração de imagens + miniaturas na tela de revisão | ✅ "3 imagem(ns) encontrada(s)", 3 miniaturas renderizadas (as fotos reais de vegetação alta anexadas à AVU) |
| Classificação por IA (heurística, sem chave configurada) | ✅ ÁREAS VERDES / Vegetação, 64% — condizente com a descrição real ("Vulnerabilidade: Vegetação alta") |
| Preview do PDF original na tela de revisão | ✅ renderiza a página real dentro do `<iframe>` |

**Bug encontrado e corrigido nesta verificação (já existente, não relacionado às causas acima)**: `categoria_sugerida`/`subcategoria_sugerida` são colunas de texto livre, não um enum no banco — a tela de revisão fazia `AVU_IMPORT_SUBCATEGORIES[categoria].map(...)` assumindo que o valor vindo do banco sempre bate exatamente com uma das chaves da taxonomia. Um valor levemente diferente quebrava a página inteira (`Cannot read properties of undefined (reading 'map')`). Corrigido nos dois lugares: `ImportReviewPage.tsx` valida contra `AVU_IMPORT_CATEGORIES`/`AVU_IMPORT_SUBCATEGORIES` antes de usar, caindo em `OUTROS`/primeira subcategoria se o valor não bater; `aiProviders.ts` faz a mesma validação na resposta da OpenAI antes de retornar.

**Taxonomia de categoria/subcategoria atualizada** (`subcategories.ts`, `classify.ts`, `src/features/imports/taxonomy.ts`) para bater exatamente com a especificação de negócio: ÁREAS VERDES (Roço, Capina, Poda, Árvores, Vegetação, Mato, Supressão Vegetal, Outros), MANUTENÇÃO (Muros, Cercas, Concertina, Portões, Outros), ILUMINAÇÃO (Poste, Luminária, Refletor, Fotocélula, Cabo, Outros), OUTROS (Outros).

**Fallback de OCR** (`lib/ocr.ts`, novo): antes de usar OCR, o pipeline sempre tenta o texto digital nativo primeiro; só recorre a OCR se o texto extraído tiver menos de 100 caracteres (limiar folgado — o modelo real tem mais de 2000). Não existe engine de OCR embutida no runtime Deno Edge (rasterizar páginas exigiria `canvas`, indisponível sem binário nativo) — delega pra uma API externa (OCR.space, aceita PDF direto) via o secret opcional `OCR_SPACE_API_KEY`, mesmo padrão plugável já usado em `aiProviders.ts`. Sem a secret configurada, falha com mensagem clara em vez de fingir que tentou. O modelo padrão de AVU (confirmado com o PDF real) é sempre gerado digitalmente (impressão de página web pra PDF, texto nativo), então este caminho só é exercitado se alguém enviar um formulário escaneado/fotografado — não coberto pela verificação real desta sessão por falta de uma amostra desse tipo.

**Duplicidade de Número do AVU**: `avu_import_confirm_create_avu` (migration `0011`) agora verifica antes do insert e levanta uma mensagem amigável ("Já existe uma AVU cadastrada com o número %") em vez do erro cru de violação de constraint `unique` do Postgres.

Dados de teste desta verificação (linhas `avu_imports` de teste, incluindo a importação real reprocessada) permanecem em produção como evidência da correção — a AVU real correspondente **não foi confirmada/criada** (decisão deixada para o usuário, que pode revisar e confirmar pela tela de revisão).

## `src/features/sap/extractAvuNumero.test.ts` (Sprint 9 — integração SAP)

8 testes, função pura sem rede: exemplo exato do pedido (`"AVU2026004155 - Recuperação de Cerca"` → `"AVU2026004155"`); número no meio da string; case-insensitivo com normalização para maiúsculas; descrição `null`/vazia retorna `null`; padrão de regex customizado funciona; padrão de regex inválido não lança exceção (retorna `null`); padrão default é exportado e usado quando nenhum é passado.

## Verificação manual da integração SAP (Sprint 9)

Diferente da importação de PDF, esta parte **não depende de Edge Function** (parsing de CSV/XLSX não envolve segredo, roda 100% no navegador) — por isso pôde ser testada de ponta a ponta de verdade nesta sessão, sem bloqueio de deploy.

**O que foi verificado:**

| Cenário pedido | Resultado |
|---|---|
| Migration `0009` (tabelas, tipos, RPCs, policies) | ✅ aplicada e verificada via `information_schema`/`pg_policies`/`pg_type` — 2 tabelas, 2 tipos enum, 4 funções, 6 policies |
| Importar CSV | ✅ arquivo com 2 linhas (1 com número de AVU válido, 1 sem correspondência) — `total=2, relacionados=1, não_encontrados=1` |
| Importar XLSX | ✅ mesmo cenário via `.xlsx` gerado com `exceljs` — `total=2, relacionados=1, não_encontrados=1`, parser lê célula e formata igual ao CSV |
| Extração automática do número da AVU da descrição | ✅ regex default `AVU[0-9A-Z]+` extraiu corretamente de `"AVU2026004155 - Recuperação de Cerca"` |
| AVU inexistente | ✅ número extraído sem `avus.numero_avu` correspondente → `AVU_NAO_ENCONTRADO` |
| Atualização de AVU relacionada | ✅ AVU de teste semeada com `numero_avu = 'AVU-2026-004155'` (normaliza para `AVU2026004155`, batendo com o exemplo do pedido) — após import, `nota_sap`/`ordem_manutencao` confirmados atualizados via SQL direto; Status/Prioridade da AVU **não** foram tocados (ficam só em `sap_records`) |
| Duplicidade — mesma Nota em importações diferentes | ✅ reenviar um arquivo com Notas já vistas em import anterior → ambas as linhas caem em `DUPLICADO` (checagem é global, não só dentro do mesmo arquivo) |
| Duplicidade — mesma Nota dentro do mesmo arquivo | ✅ CSV com a Nota repetida na 3ª linha → linha adicional cai em `DUPLICADO` |
| Tela de inconsistências | ✅ 5 KPIs (processados/relacionados/não relacionados/duplicados/erros) batendo com os totais; abas de filtro por `match_status`; link clicável para a AVU relacionada |
| Reprocessamento | ✅ botão "Reprocessar" reexecuta o casamento sobre os `sap_records` já salvos, sem reimportar o arquivo — resultado consistente mantido |

Dados de teste (`sap_imports`/`sap_records` das 4 importações de teste, mais a AVU semeada `AVU-2026-004155`) removidos ao final — `sap_records` some via `on delete cascade` ao apagar `sap_imports`.

## `src/features/sap/parsers/shared.test.ts` e `sapTemplate.test.ts` (template oficial + validação de arquivo)

17 testes cobrindo `parseAndValidateSapRows()` (arquivo válido sem avisos; bloqueio por coluna obrigatória ausente — uma e duas de uma vez; coluna desconhecida vira aviso sem bloquear; linha sem Nota/Descrição vira aviso listando o número da linha; data em formato não reconhecido vira aviso e o campo fica `null`; variações de cabeçalho conhecidas — ex. "Ordem de Manutenção" — continuam funcionando; arquivo vazio é erro bloqueante; linha em branco é ignorada sem gerar aviso) e `buildSapTemplateWorkbook()` (3 abas na ordem certa com DADOS_SAP primeiro — é a que o parser de XLSX lê via `worksheets[0]`; cabeçalho de DADOS_SAP/EXEMPLO bate exatamente com as colunas esperadas pelo parser, na mesma ordem; primeira linha congelada e autofiltro ativo; exemplo com o padrão `"AVU<numero> - <descrição>"`; INSTRUÇÕES documenta as 8 colunas; nome de arquivo oficial (`template_importacao_sap.xlsx`); workbook serializa em buffer sem lançar).

## Verificação manual do template oficial e da validação de arquivo (mesma sessão da Sprint 9)

**Decisão de escopo**: `Nota` e `Descrição` são as únicas colunas tratadas como obrigatórias (identidade do registro e origem do número da AVU, respectivamente) — as outras 6 são só contexto do SAP e continuam opcionais, mesmo estando entre os "8 campos" originalmente pedidos.

O botão "Baixar modelo Excel" dispara um download real no navegador (`Blob` + link temporário) — a verificação de que o arquivo gerado *é* o esperado não foi feita inspecionando o download do navegador (o sandbox de automação usado nesta sessão não expõe o diretório de download de forma confiável), mas rodando a **mesma função de produção** (`buildSapTemplateWorkbook()`, importada diretamente de `src/features/sap/sapTemplate.ts` via `npx tsx`, sem duplicar nenhuma lógica) para gerar o arquivo real em disco e reimportá-lo pela UI:

| Cenário pedido | Resultado |
|---|---|
| Template gera 3 abas (DADOS_SAP/INSTRUÇÕES/EXEMPLO) com cabeçalhos/exemplos/instruções | ✅ verificado lendo o `.xlsx` gerado com `exceljs` — 8 colunas na ordem certa, 3 linhas de exemplo em DADOS_SAP, tabela de instruções completa |
| Reimportar o próprio template gerado | ✅ aceito sem erros — `total=3, não_encontrados=3` (esperado: os números de AVU fictícios do template não existem de verdade no banco) |
| Testar arquivo com coluna obrigatória ausente (sem "Descrição") | ✅ **bloqueado antes de qualquer chamada de RPC** — nenhuma linha criada em `sap_imports`, mensagem de erro lista a coluna faltante |
| Testar arquivo com dados inválidos (linha sem Nota, linha sem Descrição, data em formato "AAAA/MM/DD" não reconhecido) | ✅ **não bloqueado** — as 3 linhas foram processadas normalmente (`total=3, não_encontrados=3`, `erros=0`), com avisos informativos exibidos antes do processamento; a linha com data inválida teve o campo de data descartado (`null`) mas seguiu processada normalmente |

Dados de teste (as 2 importações geradas nesses testes) removidos ao final.

## `src/features/avus/describeAuditChanges.test.ts` e `deadlineCheckThrottle.test.ts` (Sprint 10 — Governança)

10 testes cobrindo lógica pura sem rede: `describeAuditChanges()` (sem `metadata.changes` → rótulo genérico "Dados atualizados"; uma mudança → rótulo singular com o nome do campo; múltiplas mudanças → rótulo "N campos alterados" e comentário multi-linha "Campo: de → para" por linha; campo desconhecido usa o nome bruto; valores `null`/vazios viram travessão) e `shouldRunDeadlineCheck()` (nunca rodou → `true`; dentro do throttle → `false`; exatamente no limite → `true`; threshold customizado respeitado).

## Verificação manual de Auditoria/Notificações/Linha do tempo (Sprint 10)

Só existe um perfil real neste ambiente (`Rianderson Correa`, papéis `contratada`+`admin`, sem `company_name`) — isso limita testar ao vivo os fan-outs que **excluem o próprio autor da ação** (`avu_submit_evidence`, `sap_import_process_batch`/`retry`: `p.id <> auth.uid()`), já que o único usuário disponível seria simultaneamente quem dispara a ação e o fiscal/responsável da AVU. Para esses dois casos, a lógica da consulta que determina o destinatário foi verificada isoladamente (mesma query do `insert into notifications select ...`, rodada em isolamento com um `auth.uid()` simulado diferente do fiscal/responsável — retorna corretamente o perfil-alvo), em vez de observar uma notificação de verdade persistida para um segundo usuário. Todo o resto foi testado de ponta a ponta:

| Cenário pedido | Resultado |
|---|---|
| Migration `0010` (6 funções redefinidas/criadas) | ✅ aplicada e verificada via `information_schema.routines` — `audit_avus_change` (trigger), `avu_generate_deadline_notifications`/`avu_submit_evidence`/`log_avu_access`/`sap_import_process_batch`/`sap_import_retry` (as 3 últimas redefinidas, mesma assinatura) |
| Diff de auditoria (`audit_avus_change`) | ✅ update direto em AVU de teste (descrição + prioridade) → `audit_logs.metadata.changes` com os 2 campos e valores de/para corretos; timeline e página de Auditoria renderizam "2 campos alterados" com o diff linha a linha |
| Log de acesso ("quem acessou") | ✅ abrir o detalhe da AVU gravou exatamente **uma** linha `avu.viewed` (sem duplicar em re-render), com `actor_id` do usuário logado; **não aparece na timeline da AVU** (só na página de Auditoria), como projetado |
| Linha do tempo completa | ✅ evidência de teste (`avu_evidences`) e Nota SAP de teste (`sap_records`) inseridas diretamente → ambas apareceram na timeline com ícone/rótulo/comentário corretos, junto com "AVU criada"/diff de atualização |
| Página de Auditoria (`/auditoria`) | ✅ filtros (entidade/ação/usuário/data) e tabela renderizando corretamente, diff na coluna Detalhe, link para a AVU quando `entity='avus'` |
| `avu_generate_deadline_notifications` (botão "Verificar prazos agora") | ✅ AVU de teste vencida (`data_limite` = ontem) e AVU próxima do vencimento (`data_limite` = +2 dias), ambas com fiscal/responsável = o usuário logado → 2 notificações geradas com o texto certo ("AVU vencida"/"Prazo próximo"), badge do sino atualizado, chamada de novo não duplicou (idempotência de 20h) |
| Página de Notificações (`/notificacoes`) | ✅ abas Todas/Não lidas/Lidas, marcar individual como lida (clique navega para a AVU e marca lida), contador do sino atualiza |
| Fan-out de evidência/SAP (`p.id <> auth.uid()`) | ⚠️ não observado de ponta a ponta (limitação de ambiente com 1 usuário só, ver acima) — lógica da consulta verificada isoladamente |

Dados de teste (2 AVUs, 1 evidência, 1 importação SAP + 1 registro, 2 notificações, entradas de `audit_logs` relacionadas) removidos ao final.

## `src/features/reports/describeConclusao.test.ts` e `avusReportExcel.test.ts` (Sprint 11 — Relatórios)

13 testes cobrindo lógica pura: `describeConclusao()` (sem decisão de fiscalização → cai no status atual; com decisão sem comentário → só o rótulo; com comentário → rótulo + comentário; as 3 decisões — aprovado/reprovado/complementação) e `buildAvusReportWorkbook()` (mesmo padrão de `sapTemplate.test.ts`: cabeçalho na ordem certa, uma linha por AVU com status/responsável/fiscal resolvidos, congelamento/autofiltro, datas como células de data reais, serializa em buffer sem lançar mesmo com lista vazia).

## Verificação manual de Relatórios (Sprint 11)

Diferente do template SAP (gerado via `npx tsx` fora do navegador), o laudo por AVU depende de dados **e sessão autenticada reais** do Supabase (RLS, signed URLs de Storage) — testar via `tsx` fora do navegador exigiria replicar uma sessão autenticada manualmente, então a verificação aqui foi feita **inteiramente dentro do navegador**, via `import()` dinâmico dos módulos reais direto no console (mesma técnica já usada nesta sessão para chamar `uploadEvidences` sem passar pela tela do Portal), o que também tem a vantagem de exercitar a sessão/RLS de verdade, não uma simulação.

**Dados de teste**: 1 AVU (`status='EM_EXECUCAO'`, sem passar pela máquina de estados — inserida direto via SQL, então sem entrada em `avu_status_history`, logo sem "Data de conclusão"), 1 foto em Documentos/Fotos (upload real via UI, arquivo PNG mínimo), 1 evidência de foto (upload real via `uploadEvidences()` chamado do console, mesmo código de produção do Portal), 1 decisão de fiscalização (`avu_approvals`, decisão "reprovado" com comentário) inserida direto via SQL.

| Cenário pedido | Resultado |
|---|---|
| `getAvuLaudoData()` monta todos os campos corretamente | ✅ número/descrição/responsável/OM/Nota SAP corretos; `dataConclusao=null` (AVU nunca passou pela máquina de estados, como esperado); `conclusao="Reprovado — <comentário do fiscal>"` (decisão de fiscalização venceu o fallback de status, como projetado); 1 foto antes + 1 foto depois, cada uma com signed URL de verdade do Storage |
| Geração do PDF do laudo (`downloadAvuLaudoPdf`) | ✅ chamada real (dados reais + fetch das imagens via signed URL + render do `@react-pdf/renderer`) completou sem lançar exceção — download disparado |
| Botão "Relatório PDF" no detalhe da AVU | ✅ clique não gerou nenhum erro no console, estado de carregamento do botão funcionou |
| Página `/relatorios` — preview filtrado | ✅ `AvuFiltersBar` reaproveitada renderiza e filtra; tabela de preview mostra a AVU de teste |
| Exportação em lote — Excel (`downloadAvusReportExcel`) | ✅ workbook gerado com buffer de tamanho > 0, sem lançar |
| Exportação em lote — PDF (`downloadAvusReportPdf`) | ✅ chamada real completou sem lançar exceção, download disparado |

Dados de teste (1 AVU, 1 decisão de fiscalização, 1 anexo + arquivo físico no bucket `avu-attachments`, 1 evidência + arquivo físico no bucket `avu-evidences`) removidos ao final — os arquivos físicos foram removidos explicitamente via `supabase.storage.from(bucket).remove(...)` antes de apagar a AVU (o `on delete cascade` do Postgres limpa as linhas das tabelas, mas não os objetos no Storage).
