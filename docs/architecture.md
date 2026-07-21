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
| SAP PM | `src/features/sap/` | pasta reservada |
| APIs corporativas | `src/services/` | um service por integração, seguindo o padrão de `profileService.ts` |
| OCR / IA | `src/features/ai/` | pasta reservada |
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
