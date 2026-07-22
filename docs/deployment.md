# Deploy — GitHub Pages

O app é publicado como site estático em **https://riandersoncorrea.github.io/gestao-avu/** — um subcaminho, não a raiz do domínio (`riandersoncorrea.github.io` é o domínio de usuário do GitHub Pages, compartilhado por todos os repositórios daquela conta; cada repositório ganha um subcaminho com seu próprio nome).

## Caminho base (`/gestao-avu/`)

`vite.config.ts` define `base` condicionalmente:

```ts
base: command === 'build' ? '/gestao-avu/' : '/'
```

Só o **build de produção** (`npm run build`/`vite build`) usa `/gestao-avu/` — `npm run dev` continua servindo em `/`, sem exigir navegar para um subcaminho localmente. `vite preview` (que serve o `dist/` já buildado) precisa ser acessado em `http://localhost:4173/gestao-avu/`, coerente com o build de produção.

`import.meta.env.BASE_URL` (preenchido automaticamente pelo Vite a partir de `base`) é a fonte única desse valor em runtime — usado em dois lugares, nenhum com o caminho hardcoded:
- **`src/app/routes.tsx`** — `createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })`. Sem isso, `navigate('/avus')`/`<Link to="/avus">` resolveriam a partir da raiz do domínio, ignorando o subcaminho.
- **`src/features/auth/authService.ts`** (`requestPasswordReset`) — o link de recuperação de senha enviado por e-mail pelo Supabase Auth usava `${window.location.origin}/redefinir-senha` (hardcoded, assumindo deploy na raiz). Corrigido para `${window.location.origin}${import.meta.env.BASE_URL}${ROUTES.resetPassword.slice(1)}` — sem esse ajuste, o link do e-mail apontaria para fora do subcaminho e a página nunca carregaria.

Favicon (`index.html`, referenciado como `/favicon.svg`) e todos os assets importados como módulo ES (logos em `src/assets/`) já são reescritos automaticamente pelo Vite com o prefixo `base` no build — nenhum ajuste manual necessário nesses casos.

## BrowserRouter mantido (não HashRouter)

O projeto já usava `createBrowserRouter` (URLs limpas, ex. `/avus`, `/planejamento`). GitHub Pages é um host estático puro — uma requisição direta (hard refresh, link compartilhado) a `/gestao-avu/avus` não encontra um arquivo real nesse caminho e devolveria 404 antes do React Router sequer carregar.

**Considerado e descartado**: trocar para `createHashRouter` (URLs como `/gestao-avu/#/avus`) eliminaria esse problema sem nenhuma configuração extra — mas colidiria com o fluxo de recuperação de senha existente: o Supabase Auth entrega o token de recuperação como fragmento da própria URL (`#access_token=...&type=recovery`) no redirect pós-clique no e-mail. Com `HashRouter`, o React Router também usa `location.hash` para decidir qual rota renderizar — os dois sistemas disputando o mesmo fragmento de URL é uma fonte conhecida de bugs difíceis de depurar (o roteador tentando interpretar o token como se fosse um caminho de rota). Como esse fluxo já existe e não pode quebrar, ficou descartado.

**Solução adotada**: mantido `BrowserRouter` + o `basename` acima, com um *fallback* de SPA no nível do GitHub Pages — o workflow copia `dist/index.html` para `dist/404.html` no build. GitHub Pages serve `404.html` para qualquer caminho sem arquivo correspondente; como o conteúdo é idêntico ao `index.html`, o app carrega normalmente e o React Router assume o roteamento no cliente a partir daí. É a técnica padrão para SPAs com `BrowserRouter` hospedadas em GitHub Pages, e não interfere em nada com o fragmento de URL usado pelo Supabase Auth.

## Variáveis de ambiente / GitHub Secrets

O Vite embute `import.meta.env.VITE_*` no bundle **em tempo de build**, não em runtime — por isso essas variáveis precisam existir como **Secrets do repositório** (Settings → Secrets and variables → Actions → *Repository secrets*), disponíveis para o step de build do workflow:

| Secret (nome exato) | Uso | Obrigatório |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts` | Sim |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.ts` | Sim |
| `VITE_MAPTILER_KEY` | `src/features/gis/mapStyles.ts` (camadas Satélite/Híbrido do mapa) | Não — sem ele, essas duas opções ficam desabilitadas e o resto do mapa funciona normalmente |

Nenhuma outra variável `VITE_*` é lida pelo código. `.env` continua ignorado pelo Git (`.gitignore`) e nunca é lido pelo workflow — os Secrets são a única fonte dessas credenciais em CI. `.env.example` continua como referência para configuração local.

## Workflow (`.github/workflows/deploy.yml`)

Dispara em push para `main` ou manualmente (`workflow_dispatch`). Dois jobs:
1. **build** — `npm ci` → `npm run build` (com os Secrets acima como env) → copia `404.html` → cria `.nojekyll` (desabilita o processamento Jekyll do GitHub Pages, que por padrão ignora certos arquivos/pastas) → publica `dist/` como artefato via `actions/upload-pages-artifact`.
2. **deploy** — publica o artefato via `actions/deploy-pages` (mecanismo nativo do GitHub Pages via OIDC, sem precisar de token/branch `gh-pages`).

## Configuração necessária no GitHub

**Settings → Pages → Build and deployment → Source**: selecionar **"GitHub Actions"** (não "Deploy from a branch") — o workflow já cuida de tudo a partir daí.

## Primeiro deploy

1. Configurar os Secrets listados acima.
2. Ajustar a Source em Settings → Pages (acima).
3. Dar push para `main` (ou rodar o workflow manualmente em Actions → Deploy to GitHub Pages → Run workflow).
4. Acompanhar o job em Actions — ao concluir, o app estará em **https://riandersoncorrea.github.io/gestao-avu/**.
