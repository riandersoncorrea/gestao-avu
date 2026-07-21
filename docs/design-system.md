# Design System — Gestão de AVU

Tokens definidos em `src/index.css` (Tailwind v4, `@theme`). Sem `tailwind.config.ts` — este é o modelo CSS-first do Tailwind 4.

## Referência visual

Paleta e estilo geométrico (blocos com cantos arredondados, onda verde de rodapé) extraídos visualmente de duas imagens de referência fornecidas: a logo "Serviços Operacionais São Luís EFC" (ícone com 5 figuras coloridas representando áreas de serviço) e um template de slide com identidade Vale.

**Os valores HEX abaixo são uma calibração visual**, não uma extração pixel-a-pixel — ajustar quando houver manual de marca oficial ou arquivos de logo em alta resolução.

## Cores

### Primária — teal/verde Vale

Cor de ação principal (botões primários, links, foco, item ativo da sidebar).

| Token | Hex | Uso |
|---|---|---|
| `primary-50` | `#EBF8F6` | fundos sutis |
| `primary-500` | `#0E9B8A` | base |
| `primary-600` | `#0C8175` | botão primário (padrão) |
| `primary-700` | `#0A675F` | hover/texto sobre fundo claro |
| `primary-900` | `#053430` | texto de alto contraste |

### Secundária — verde médio (também "success")

Base `#2EAD8A`. Escala `secondary-50` → `secondary-900`. Usada em `StatusBadge` tone `success` e KPIs de tendência positiva.

### Mint — verde claro de apoio

`mint-100` `#DFF3ED` · `mint-300` `#A9DED0` · `mint-500` `#72C4B0` · `mint-700` `#3E9682`. Uso decorativo (blocos geométricos, como na tela de login).

### Gold — dourado/amarelo

Base `#F2B705`. Escala `gold-50` → `gold-900`. Usada em `StatusBadge` tone `warning` e alertas.

### Magenta — categoria "alimentação" (ícone SEOP)

Base `#C6376B`. Escala `magenta-50` → `magenta-900`. Usada em `StatusBadge` tone `danger`, botão `danger`, erros de formulário.

### Sky — categoria "transporte" (ícone SEOP)

Base `#4FB3D9`. Escala `sky-50` → `sky-900`. Usada em `StatusBadge` tone `info`.

### Graphite — neutro escuro / texto

Base `#263238` (`graphite-700`, cor de texto padrão do corpo). Escala completa `graphite-50` → `graphite-900` para overlays, texto e fundos escuros.

### Gray — neutro de UI

`gray-50` `#FAFAFA` (fundo de página) → `gray-200` `#E5E5E5` (bordas/divisores) → `gray-500` `#A7A9AA` (texto terciário) → `gray-900` `#363738`.

### Categorias do ícone SEOP (paleta secundária de tags)

O ícone SEOP usa 5 cores para 5 áreas de serviço (manutenção/teal, alimentação/magenta, transporte/sky, mineração/gold, meio ambiente/secondary-green). Essas mesmas 5 cores formam a paleta usada em `Badge`/`StatusBadge` para categorizar por tipo — não criar cores novas para isso; reutilizar `primary`, `magenta`, `sky`, `gold`, `secondary`.

## Tipografia

Fonte: pilha de sistema (`ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) — sem carregamento externo de fonte, importante para ambiente corporativo/intranet.

| Uso | Classe Tailwind |
|---|---|
| Título de página (`PageHeader`) | `text-xl font-semibold` |
| Título de card | `text-sm font-semibold` |
| Corpo | `text-sm` (padrão) |
| Legendas/hints | `text-xs text-gray-500` |
| Valor de KPI | `text-2xl font-semibold` |

## Espaçamento e forma

- Escala de espaçamento: padrão do Tailwind (múltiplos de `0.25rem`).
- Cantos arredondados: `rounded-xl` (inputs, botões) e `rounded-2xl` (cards, modais, tabelas) como padrão — reflete os blocos arredondados da referência visual. Badges usam `rounded-full`.
- Cards: `border border-gray-200` + `shadow-sm`, sem sombra pesada (visual corporativo, não "flutuante").
- A onda/curva verde da referência é usada pontualmente (ex.: rodapé decorativo de `LoginPage`), não em toda a UI — documentado como elemento de destaque, não um padrão repetido em todo canto.

## Componentes (`src/components/`)

| Componente | Arquivo | Notas |
|---|---|---|
| `Button` | `Button.tsx` | variants `primary`/`secondary`/`outline`/`ghost`/`danger`, tamanhos `sm`/`md`/`lg`, estado `isLoading` |
| `Input` | `Input.tsx` | `label`, `error`, `hint` |
| `Textarea` | `Textarea.tsx` | mesma API do `Input`, para campos multilinha (ex.: `descricao` da AVU) |
| `Select` | `Select.tsx` | nativo, estilizado, mesma API de erro do `Input` |
| `Tabs` | `Tabs.tsx` | abas genéricas (`tabs`/`activeKey`/`onChange`) — usadas em `AdminPage` e no detalhe da AVU (7 abas) |
| `Modal` | `Modal.tsx` | portal, fecha com `Esc`/overlay, tamanhos `sm`/`md`/`lg` |
| `ConfirmDialog` | `ConfirmDialog.tsx` | composição sobre `Modal` para confirmações destrutivas/não-destrutivas |
| `Badge` / `StatusBadge` | `Badge.tsx`, `StatusBadge.tsx` | `StatusBadge` mapeia `StatusTone` (`success`/`warning`/`danger`/`info`/`neutral`) para cor |
| `Card` (+ `CardHeader`/`CardTitle`/`CardContent`) | `Card.tsx` | container base |
| `KpiCard` | `KpiCard.tsx` | indicador com ícone e tendência opcional |
| `Table` (primitivos) / `DataTable` | `Table.tsx`, `DataTable.tsx` | `DataTable` adiciona paginação client-side simples sobre os primitivos de `Table`, mais `onRowClick` opcional (ex.: ir para o detalhe da AVU) |
| `EmptyState` | `EmptyState.tsx` | usado por `DataTable` vazio e páginas placeholder |
| `LoadingState` | `LoadingState.tsx` | spinner + texto |
| `Toast` / `ToastProvider` / `useToast` | `Toast.tsx` | notificações efêmeras (5s), portal no `body` |
| `PageHeader` | `PageHeader.tsx` | título + descrição + ações da página |

Barrel export em `src/components/index.ts`.

## Estados

- **Loading**: `LoadingState` (blocos de conteúdo) ou `isLoading` em `Button`/`ConfirmDialog` (ações).
- **Vazio**: `EmptyState`, com título + descrição + ação opcional.
- **Erro de formulário**: prop `error` em `Input`/`Select`, texto em `magenta-600`, borda `magenta-500`.
- **Erro de rota**: `NotFoundPage` (rota `*`).
- **Feedback assíncrono**: `useToast().show({ tone, title, description })`, tones `success`/`error`/`warning`/`info`.

## Layout

- `MainLayout`: sidebar (fixa em desktop `lg:`, drawer com overlay em mobile) + header fixo no topo + área de conteúdo com `padding` responsivo (`p-4 sm:p-6 lg:p-8`).
- `Sidebar`: logo SEOP no topo, navegação com item ativo destacado (`bg-primary-50 text-primary-700`), rodapé com usuário (mock) + botão "Sair".
- `Header`: botão de menu (mobile), título da aplicação, sino de notificações (placeholder), logo Vale.
- Breakpoints: mobile (`<1024px`, sidebar em drawer) e desktop (`≥1024px`, sidebar fixa) — usa o breakpoint `lg` padrão do Tailwind.
