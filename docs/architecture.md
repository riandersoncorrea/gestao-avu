# Arquitetura — Gestão de AVU

## Visão geral

Sistema web corporativo para centralizar a gestão de AVUs (Análises de Vulnerabilidades) da Serviços Operacionais São Luís EFC — da identificação da vulnerabilidade até resolução, execução, fiscalização e encerramento.

A Sprint 0 entregou a **fundação técnica**: scaffolding, design system, layout, navegação, componentes reutilizáveis, estrutura inicial de banco e documentação. A Sprint 1 ligou **autenticação real (Supabase Auth) e controle de acesso baseado em perfis (RBAC)** para os 7 perfis do negócio. A Sprint 2 entregou o **núcleo do sistema**: CRUD completo de AVUs com escopo por linha, anexos reais (Storage), timeline e SLA. Planejamento, GIS funcional, SAP, IA/OCR e relatórios ainda não estão implementados — ver [roadmap.md](./roadmap.md).

## Stack

| Camada | Escolha | Observação |
|---|---|---|
| Build tool | Vite 8 | `react-ts` template |
| UI | React 19 + TypeScript | |
| Estilo | Tailwind CSS v4 | config CSS-first via `@theme` em `src/index.css`, plugin `@tailwindcss/vite` |
| Roteamento | React Router 7 (`createBrowserRouter`) | |
| Data fetching / cache | TanStack Query 5 | provider global em `src/app/App.tsx` |
| Formulários | React Hook Form + Zod (`@hookform/resolvers`) | ver `src/pages/LoginPage.tsx` como referência de padrão |
| Ícones | Lucide React | |
| Gráficos | Recharts | demo estático em `DashboardPage` |
| Mapa | **MapLibre GL JS** | ver decisão abaixo |
| Backend/Banco | Supabase (Postgres, Auth, Storage) | client em `src/lib/supabase.ts` |
| Testes | Vitest + Testing Library | `npm run test`; ver [testing.md](./testing.md) |

### Por que MapLibre GL e não Leaflet

O projeto tem como requisito futuro explícito a integração com GIS corporativo e camadas de dados geoespaciais (AVUs georreferenciadas, malha ferroviária, ativos). MapLibre GL JS tem suporte nativo a vector tiles, estilos customizados e camadas de dados performáticas — o caminho natural para GIS "de verdade". Leaflet seria mais simples para exibir só marcadores, mas exigiria migração quando o GIS evoluir. Nesta sprint, `features/gis/components/BaseMap.tsx` renderiza apenas o mapa base (estilo demo público do MapLibre, sem API key), usado por `pages/MapPage.tsx`.

### PDF — arquitetura preparada, biblioteca não instalada ainda

`src/services/pdf/` define o contrato (`PdfDocumentDefinition`, `generatePdf()`) que a sprint de Relatórios vai implementar. Duas opções ficam em aberto para aquele momento:

- **`@react-pdf/renderer`** (cliente): simples, sem dependência de servidor, bom para laudos com layout previsível.
- **Função Edge do Supabase + Puppeteer** (servidor): melhor para paginação complexa e quando o PDF precisa combinar dados de múltiplas fontes (SAP, GIS, fotos).

A decisão fica para quando os requisitos de relatório estiverem definidos.

### Importação de PDF e abstração de `AIProvider` (Sprint 9)

`supabase/functions/process-avu-import/` é a primeira Supabase Edge Function do projeto — a única peça deste stack (Vite SPA + Supabase) que pode segurar uma chave de IA com segurança. **Chave de API nunca fica no frontend**: `VITE_*` nunca contém segredo de provedor de IA; a chave real (`OPENAI_API_KEY`, opcional) é configurada como secret da function (`supabase secrets set`), lida só em `lib/aiProviders.ts` (o único arquivo do pipeline que toca `Deno.env`).

O sistema nunca fica acoplado a um único provedor — interface `AIProvider` (`classify(descricao)`):

| Provider | Quando é usado | Chamada externa? |
|---|---|---|
| `HeuristicAIProvider` | padrão, sempre disponível | não — classificador por palavra-chave, determinístico |
| `OpenAIProvider` | só se `OPENAI_API_KEY` estiver configurada no Edge Function | sim — Chat Completions API |
| Azure OpenAI / modelo corporativo | próximo a implementar (mesma interface) | ainda não implementado — não construído especulativamente |

A `getAIProvider()` factory escolhe pela presença do secret; sem chave configurada, o pipeline continua funcionando normalmente, só com confiança mais conservadora (o classificador heurístico tem um teto de confiança baixo de propósito — ver `docs/testing.md`).

O pipeline (PDF → OCR/extração de texto → extração de campos → extração de imagens → classificação IA → validação → criação do AVU) roda inteiro dentro da function, autenticado com o JWT de quem chamou (a mesma disciplina das RPCs `security definer`: a function nunca confia só em quem conseguiu invocá-la). A AVU real só é criada em `avus` quando a validação passa (confiança ≥ 80%) ou quando um humano confirma na tela de revisão (`pages/ImportReviewPage.tsx`) — os arquivos ficam num bucket de staging (`avu-import-staging`) até esse momento, e o PDF final + imagens extraídas viram `avu_attachments` normais (mesmo bucket/tabela da Sprint 2).

### Integração SAP — importação de arquivo, preparado para API/OData/BTP depois (Sprint 9)

`src/features/sap/` implementa o MVP pedido: importação de arquivos **exportados** do SAP (CSV/XLSX) — **não conexão direta com o SAP** (fora de escopo desta sprint). Diferença importante em relação à importação de PDF: parsing de CSV/XLSX não envolve nenhum segredo, então roda **inteiro no navegador** (`papaparse` para CSV, `exceljs` para XLSX) — não precisa de Edge Function nem de chave de API.

- **`extractAvuNumero(descricao, pattern)`** — função pura que extrai o número da AVU da descrição do SAP via regex configurável (padrão `AVU[0-9A-Z]+`, ajustável na própria página de importação). O padrão efetivamente usado fica gravado em `sap_imports.regex_pattern` por importação, para auditoria/reprodutibilidade.
- **`parsers/csv.ts`/`parsers/xlsx.ts`** — convergem para a mesma forma validada (`SapParseOutcome`), mapeando variações de cabeçalho (`HEADER_ALIASES` em `parsers/shared.ts`) para os 8 campos pedidos (Nota/OM/Status/Centro/Data Planejada/Data Execução/Prioridade/Descrição).
- **Validação de arquivo antes de importar** (`parseAndValidateSapRows()` em `parsers/shared.ts`): coluna obrigatória ausente (Nota ou Descrição) bloqueia o import inteiro com mensagem clara, antes de qualquer chamada de RPC; coluna desconhecida, linha sem Nota/Descrição e data em formato não reconhecido viram avisos não bloqueantes (a linha segue para o mesmo caminho de sempre — `AVU_NAO_ENCONTRADO` quando não há número extraído). Nada disso altera a lógica de relacionamento SAP→AVU, que continua 100% no banco.
- **Template oficial (`sapTemplate.ts`, botão "Baixar modelo Excel")**: gerado com `exceljs` a partir das mesmas constantes de `parsers/shared.ts` (`SAP_COLUMN_ORDER`/`CANONICAL_HEADERS`) — impossível o template e o parser divergirem, pois compartilham a fonte. 3 abas: DADOS_SAP (cabeçalho formatado, congelado, autofiltro, exemplos fictícios, validação de dados para datas/prioridade), INSTRUÇÕES (documentação coluna a coluna + formatos de data aceitos) e EXEMPLO (mais casos fictícios preenchidos).
- **Relacionamento SAP → AVU por match exato normalizado**: `normalize_avu_numero()` (Postgres) remove tudo que não é letra/dígito e uppercasa antes de comparar — decisão deliberada em vez de match "flexível"/`ilike`, para não arriscar ligar a AVU errada (ver `docs/database.md`, migration `0009`).
- **Atualização de AVU é restrita**: só `nota_sap`/`ordem_manutencao` são sobrescritos quando um match é encontrado — Status/Centro/Datas/Prioridade do SAP ficam só em `sap_records`, nunca sobrescrevem o workflow interno da AVU (que já tem sua própria lógica de status/SLA/risco).
- **Duplicata = mesma "Nota" já vista**, nesta importação ou em qualquer anterior — a RPC `sap_import_process_batch` processa o lote inteiro numa chamada, com captura de exceção por linha (uma linha malformada vira `ERRO` sem derrubar o lote), mesmo espírito de resiliência do pipeline de PDF.
- **Reprocessamento** (`sap_import_retry`) reaplica o casamento sobre os `sap_records` já salvos, sem reimportar o arquivo — útil depois de ajustar o regex ou quando mais AVUs passam a existir.
- **Preparado para o futuro, não construído especulativamente**: SAP API/OData/SAP BTP/integração corporativa continuam sem cliente HTTP nenhum — quando existir uma dessas integrações de verdade, o padrão de service (`sapImportService.ts`) e a RPC de casamento (`sap_import_process_batch`) já dão o contrato de dados esperado; só muda a origem dos registros (arquivo → API).

### Governança/Rastreabilidade — auditoria, notificações, linha do tempo (Sprint 10)

Extensão da auditoria e das notificações já existentes desde as Sprints 1/5 — nenhuma tabela nova, tudo em cima de `audit_logs`/`notifications` (migration `0010_governanca.sql`, ver `docs/database.md`).

- **Auditoria com diff real**: `audit_avus_change()` (trigger) grava `metadata.changes` só com os campos que de fato mudaram num update de AVU (`{campo: {from, to}}`), em vez do genérico `metadata=null` de antes. `src/features/avus/describeAuditChanges.ts` (função pura, testada) transforma isso num rótulo curto + comentário multi-linha "Campo: de → para", reaproveitado tanto na timeline da AVU quanto na página de Auditoria.
- **"Quem acessou"**: RPC `log_avu_access(p_avu_id)` grava `action='avu.viewed'`. Chamada uma vez por visualização do detalhe da AVU (`AvuDetailPage.tsx`), com dedupe client-side por sessão (`logAvuAccessOnce`, um `Set` em módulo) — evita duplicar o log a cada re-render. Esse evento **não aparece na timeline visível da AVU** (seria ruído para o usuário comum) — só na página de Auditoria (`/auditoria`, atrás de `RequirePermission permission="history.view"`, mesma régua de quem já podia ler `audit_logs` globalmente).
- **Linha do tempo completa**: `AvuTimeline.tsx` passou a mesclar, além de `audit_logs`+`avu_status_history` (já existentes), também `avu_evidences` (evidências enviadas) e `sap_records` (Nota/OM do SAP vinculada) filtrados por `avu_id` — cobre Criação/Triagem/Planejamento/Programação/Execução/Conclusão (via status), Nota/OM (via SAP), Evidências e Fiscalização/Aprovação (via status, que já carrega o mesmo comentário/ator de `avu_approvals` através do GUC de transição — por isso `avu_approvals` **não** é mesclada separadamente na timeline, seria literalmente a mesma informação duplicada; `listApprovals()` existe como serviço reaproveitável, mas não é chamada por `AvuTimeline`).
- **Novos eventos de notificação**: `avu_submit_evidence` e `sap_import_process_batch`/`sap_import_retry` (redefinidas, sem mudar a lógica de validação/casamento já existente) ganharam um `insert into notifications` no fan-out, avisando o fiscal/responsável da AVU. Nenhuma dessas notifica o próprio autor da ação (`p.id <> auth.uid()`, mesmo guard já usado em `avu_review_evidence` desde a Sprint 5).
- **Prazo próximo/AVU vencida sem `pg_cron`**: este projeto está no plano Supabase **Free**, onde `pg_cron` tipicamente não está disponível — não há nenhum job agendado de verdade. Em vez disso, `avu_generate_deadline_notifications()` é uma RPC idempotente (não duplica a mesma notificação em 20h) chamada **sob demanda**: uma vez por sessão pelo `MainLayout` (throttle de 6h via `localStorage`, ver `src/features/avus/deadlineCheckThrottle.ts`, função pura testada) e manualmente pelo botão "Verificar prazos agora" na página de Auditoria. **Caminho de upgrade futuro**: habilitar `pg_cron` (Supabase Pro+) e agendar `select avu_generate_deadline_notifications();` direto no Postgres, ou uma Edge Function chamada por um scheduler externo (GitHub Actions, cron-job.org) — nenhum dos dois construído agora, é só troca de gatilho, a RPC já está pronta para ambos.
- **Centro de notificações**: `NotificationsBell.tsx` (já existia) ganhou um link "Ver todas" para a nova página `/notificacoes` (`RequireAuth` apenas — são notificações pessoais, RLS já restringe a `user_id = auth.uid()`), com abas Todas/Não lidas/Lidas.

### Supabase

`src/lib/supabase.ts` cria o client a partir de `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (ver `.env.example`). Sem essas variáveis, o app ainda sobe (aponta para um projeto placeholder), mas nenhuma chamada de rede funciona de verdade. Desde a Sprint 2, o Storage também é usado de verdade (bucket `avu-attachments` — ver `docs/database.md`), não só o Postgres/Auth.

### Autenticação e RBAC (Sprint 1)

**Nunca confiar só no frontend**: toda checagem de permissão feita em React (`useAuth().hasPermission(...)`, os guards de rota, esconder um botão) é só UX. A autorização de verdade é sempre reforçada no Postgres via RLS e funções `security definer` (`is_admin()`, `has_permission()`, `has_role()` — ver [database.md](./database.md)). Mesmo que alguém chame uma RPC ou a REST API diretamente, contornando a UI inteira, o banco barra.

- **`src/features/auth/AuthContext.tsx`** — `AuthProvider`/`useAuth()`: ouve `supabase.auth.onAuthStateChange`, carrega perfil + perfis(roles) + permissões resolvidas (`authService.fetchMyAccessProfile`) e expõe `session`, `roles`, `permissions`, `isAdmin`, `hasPermission()`.
- **`src/features/auth/permissions.ts`** — funções puras (`derivePermissionSet`, `hasPermission`, `hasRole`, `isAdmin`) que transformam o resultado bruto do Supabase (`user_roles → roles → role_permissions → permissions`) num `{ roles, permissions }` resolvido. Testadas em `permissions.test.ts` sem precisar de rede.
- **`src/features/auth/ProtectedRoute.tsx`** — guardas de rota como *layout routes* do React Router:
  - `RequireAuth` — sem sessão → redireciona para `/login` (guardando a rota de origem em `location.state.from`).
  - `RequireAdmin` — sem o perfil admin → redireciona para `/acesso-negado`.
  - `RequirePermission` — variante genérica por `PermissionKey` (pronta para as próximas sprints).
  - `RedirectIfAuthenticated` — evita mostrar login/cadastro/esqueci-senha para quem já tem sessão.
- **Provisionamento por convite**: como o projeto Supabase tem `disable_signup=false` (cadastro público ligado) e `mailer_autoconfirm=false` (confirmação de e-mail obrigatória), a proteção contra cadastro não autorizado vive inteiramente no banco — `handle_new_user()` só cria o perfil se houver um `user_invites` pendente para aquele e-mail (ou se for o *bootstrap* do primeiro admin). Nenhuma `service_role key` é usada em lugar nenhum do cliente. Ver [database.md](./database.md) para o detalhe da migration `0002_rbac_and_invites.sql`.
- **`AdminPage`** — tela de gerenciamento de usuários (abas Usuários/Convites), usando TanStack Query para cache/mutations e as RPCs `admin_set_user_roles`/`admin_set_user_active` (nunca escrevendo direto em `user_roles`/`profiles.is_active` do cliente).

### Núcleo de AVUs (Sprint 2)

Mesmo princípio da Sprint 1 ("nunca confiar só no frontend"), estendido para a primeira tabela de negócio de verdade:

- **`can_view_avu(avu_id)`/`can_write_avu_related(avu_id)`** (`supabase/migrations/0003_avus.sql`) — mesma família de `is_admin()`/`has_permission()`, mas por linha: decidem se o usuário atual pode ver/escrever numa AVU específica com base no seu perfil **e** nos dados daquela AVU (Fiscal atribuído, empresa da Contratada, área do Gestor). Reaproveitadas nas RLS de `avus`, `avu_comments`, `avu_attachments` e nas policies de `storage.objects` — uma única fonte de verdade para "quem pode ver o quê", em vez de reescrever a mesma lógica em quatro lugares.
- **Ações sensíveis como RPC, não como policy ampla de UPDATE**: `avu_submit_evidence()` (Contratada) e `avu_review_execution()` (Fiscal) seguem o padrão de `admin_set_user_roles()` da Sprint 1 — cada uma faz sua própria checagem de autorização e grava auditoria, em vez de depender de uma policy de `UPDATE` genérica que precisaria confiar no cliente para só tocar os campos certos.
- **`features/avus/permissions.ts`** — espelha `can_write_avu_related()` no cliente só para esconder o formulário de comentário/anexo do Leitor (UX); a autorização real continua sendo a RLS.
- **Anexos via Storage**: `src/features/avus/avuService.ts` faz upload para o bucket `avu-attachments` e sempre lê de volta via signed URL (nunca URL pública) — path `<avu_id>/<uuid>-<nome>` é o mesmo dado que as policies de `storage.objects` usam para aplicar `can_view_avu()`.
- **`features/avus/sla.ts`** — cálculo de SLA (dias até o prazo, dias em atraso, indicador no prazo/próximo do vencimento/vencido/encerrado) é função pura, sem acesso a rede, para ficar 100% testável (`sla.test.ts`).

### Preparado para integrações futuras

| Integração | Onde vive | Status |
|---|---|---|
| SAP PM | `src/features/sap/` | implementado: importação de arquivo (CSV/XLSX). API/OData/BTP — próximo passo, mesma interface de dados |
| APIs corporativas | `src/services/` | um service por integração, seguindo o padrão de `profileService.ts` |
| OCR / IA | `supabase/functions/process-avu-import/lib/` (classificação) | implementado para importação de PDF (Sprint 9) — abstração `AIProvider`, ver seção abaixo |
| GIS avançado | `src/features/gis/` | mapa base já funcional, camadas de dados na próxima sprint |
| App mobile | N/A nesta sprint | a separação `services/` (lógica) vs. `components/`/`pages/` (UI web) facilita reuso de lógica se um app React Native for criado depois |
| Offline | N/A nesta sprint | TanStack Query já é a camada de cache — path natural para persistência offline (`persistQueryClient`) quando for necessário |

## Estrutura de pastas

```
src/
  app/          # App.tsx (providers), routes.tsx (definição de rotas)
  assets/       # branding/ (logos, ver README nessa pasta)
  components/   # componentes de UI reutilizáveis e agnósticos de domínio
  features/     # um módulo por domínio de negócio (auth, avus, planning, ...)
  layouts/      # MainLayout, Sidebar, Header
  pages/        # uma página por rota — compõe layouts + features
  services/     # acesso a dados (Supabase, futuras APIs, PDF)
  hooks/        # hooks genéricos (useMediaQuery, useDisclosure)
  lib/          # infraestrutura (supabase client, cn(), constantes de rota)
  types/        # tipos compartilhados entre camadas
  utils/        # funções puras (formatação de data/número)
supabase/
  migrations/   # SQL versionado do schema
docs/           # esta documentação
```

**Regra de dependência**: `components/` não importa de `features/` nem `pages/` (deve funcionar em qualquer contexto). `features/*` pode importar de `components/`, `lib/`, `services/`, `types/`. `pages/*` compõe `features/*` e `components/*`.

## Decisões técnicas relevantes

- **Tailwind v4 CSS-first**: não há `tailwind.config.ts`; tokens de design vivem em `@theme` dentro de `src/index.css` (ver [design-system.md](./design-system.md)).
- **Path alias `@/*`**: configurado em `tsconfig.app.json` e `vite.config.ts`, aponta para `src/`.
- **Sem biblioteca de tabela/UI headless externa** (ex.: TanStack Table, Radix): `DataTable` e `Modal` são implementações simples e diretas, suficientes para o volume de dados esperado nesta fase. Reavaliar se a complexidade de filtros/ordenação crescer.
- **Roteamento com `createBrowserRouter`**: prepara o terreno para *data loaders* do React Router quando as páginas passarem a buscar dados reais.
- **Lint**: o template do Vite já traz `oxlint` (`npm run lint`) em vez de ESLint tradicional — mais rápido, mesma função de linting básico.
