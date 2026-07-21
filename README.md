# Gestão de AVU — Serviços Operacionais São Luís EFC

Sistema para centralizar a gestão de AVUs (Análises de Vulnerabilidades): identificação, planejamento, execução, fiscalização e encerramento.

## Rodando localmente

```bash
npm install
cp .env.example .env   # opcional — sem isso o app roda em modo demo
npm run dev
```

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — type-check (`tsc -b`) + build de produção
- `npm run lint` — lint (oxlint)
- `npm run preview` — pré-visualiza o build de produção

## Documentação

- [`docs/architecture.md`](./docs/architecture.md) — arquitetura, stack e decisões técnicas
- [`docs/database.md`](./docs/database.md) — schema do banco e RLS
- [`docs/design-system.md`](./docs/design-system.md) — cores, tipografia, componentes
- [`docs/roadmap.md`](./docs/roadmap.md) — próximas sprints
