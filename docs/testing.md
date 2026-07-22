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

## `supabase/functions/process-avu-import/lib/*.test.ts` (Sprint 9 — importação de PDF)

14 testes cobrindo as duas peças de lógica pura do pipeline (sem `Deno.*`, testáveis via Vitest a partir do frontend mesmo vivendo em `supabase/functions/`):

- **`extractFields.test.ts`** (7 testes): extração de todos os campos de um PDF bem formado; campos obrigatórios faltando (`dataCriacao`/`descricao`) reportados em `missingFields`; campos opcionais ausentes não quebram a extração; a descrição para no próximo rótulo conhecido (não engole o resto do documento); datas ISO aceitas diretamente; datas em formato não reconhecido retornam `null` **e** contam como campo faltando (não só "rótulo ausente" — um regex que bateu mas não conseguiu parsear a data também deve cair em `REVISAO_NECESSARIA`); texto vazio não lança exceção.
- **`classify.test.ts`** (7 testes): `HeuristicAIProvider` classifica corretamente casos claros de cada uma das 4 categorias; cai em OUTROS/Geral sem palavra-chave; **nunca ultrapassa o teto de confiança do classificador heurístico** (é honestamente limitado — mesmo com várias palavras-chave de propósito, fica abaixo do limiar de 80% de validação); é determinístico.

## Verificação manual da importação de PDF (Sprint 9)

**Limitações conhecidas, leia antes de usar em produção:**
- Não havia uma amostra real do PDF "modelo padronizado" nesta sprint. Os regex de `extractFields.ts` são calibrados contra rótulos assumidos (`Número AVU:`, `Data de Criação:`, etc.) — quase certamente precisarão de ajuste fino contra um PDF real.
- `pdf.ts` (extração de imagens embutidas) só cobre imagens já codificadas como JPEG — bitmaps brutos são pulados com aviso, não implementado (exigiria um encoder PNG do zero). Validar contra um PDF real antes de confiar nessa parte.
- A Edge Function `process-avu-import` foi escrita mas **não pôde ser publicada nesta sessão** — não há CLI do Supabase logada neste ambiente (mesma limitação já documentada para migrations). Publique manualmente:
  ```bash
  npx supabase login
  npx supabase link --project-ref pgllntwbkwqekfamtahk
  npx supabase functions deploy process-avu-import
  # opcional, só se quiser sair do modo heurístico:
  npx supabase secrets set OPENAI_API_KEY=sk-...
  ```

**O que foi verificado de verdade nesta sessão** (migration `0008` aplicada; function não publicada):

| Cenário pedido | Resultado |
|---|---|
| Migration (tabelas, RPCs, policies, bucket) | ✅ aplicada e verificada via `information_schema`/`pg_policies`/`storage.buckets` |
| RPC `avu_import_confirm_create_avu` cria a AVU corretamente | ✅ testado via transação impersonando um admin (`begin`/`set_config('request.jwt.claims', ...)`/`rollback`) — AVU criada, `avu_imports` atualizada, `audit_logs`/`avu_import_logs` gravados, tudo revertido ao final |
| Upload individual | ✅ PDF real (gerado via `cupsfilter`, texto nativo) enviado pelo formulário — sobe pro bucket de staging, linha `AGUARDANDO` aparece na fila |
| Upload em lote | ✅ 2 PDFs de uma vez — cada um vira sua própria linha, processados em sequência (não simultâneo) |
| Testar falhas | ✅ **teste real, não simulado**: a Edge Function genuinamente não está publicada nesta sessão, então toda tentativa de processar cai em `ERRO` com mensagem clara (`FunctionsFetchError`/404) — validou o caminho de erro de ponta a ponta como ele realmente se comporta sem a function no ar |
| Botão "Tentar novamente" | ✅ reseta pra `AGUARDANDO` e reprocessa (volta pra `ERRO`, esperado, já que a function continua fora do ar) |
| Tela de revisão — PDF original | ✅ preview via signed URL do bucket de staging renderiza o PDF real dentro de um `<iframe>` |
| Tela de revisão — dados extraídos (REVISAO_NECESSARIA) | ✅ formulário editável pré-preenchido, badge de confiança, cascata categoria→subcategoria testada manualmente |
| Log de processamento | ✅ painel colapsável mostra as linhas de `avu_import_logs` (`UPLOAD` confirmado) |
| Confiança abaixo de 80% → revisão necessária | ✅ simulado com `confianca = 62` diretamente no banco (a Edge Function real, uma vez publicada, escreve esse valor sozinha) |

**Bug encontrado e corrigido nesta verificação**: `categoria_sugerida`/`subcategoria_sugerida` são colunas de texto livre, não um enum no banco — a tela de revisão fazia `AVU_IMPORT_SUBCATEGORIES[categoria].map(...)` assumindo que o valor vindo do banco sempre bate exatamente com uma das 4 chaves da taxonomia. Um valor levemente diferente (achado ao testar com dados sem acentuação) quebrava a página inteira (`Cannot read properties of undefined (reading 'map')`). Isso é um risco real também para o `OpenAIProvider` (resposta de LLM é texto livre, pode parafrasear/variar acentuação). Corrigido nos dois lugares: `ImportReviewPage.tsx` valida contra `AVU_IMPORT_CATEGORIES`/`AVU_IMPORT_SUBCATEGORIES` antes de usar, caindo em `OUTROS`/primeira subcategoria se o valor não bater; `aiProviders.ts` faz a mesma validação na resposta da OpenAI antes de retornar.

Dados de teste (linhas `avu_imports` + arquivos no bucket de staging) removidos ao final.
