# Branding

Arquivos de logo usados pela aplicação. Importados como módulos ES (`import logo from '@/assets/branding/arquivo.png'`), nunca referenciados como texto de URL solto — assim o bundler cuida do hash/otimização.

## Arquivos

- `sao-luis-efc-logo.png` — logo oficial "Serviços Operacionais São Luís EFC" (arquivo real, fornecido pelo usuário).
- `vale-logo.placeholder.png` — **placeholder**. Substitua pela logo Vale oficial em alta resolução assim que disponível, e atualize os imports que referenciam `vale-logo.placeholder.png` em:
  - `src/layouts/Header.tsx`
  - `src/pages/LoginPage.tsx`

## Como substituir

1. Adicione o novo arquivo nesta pasta (ex: `vale-logo.svg`).
2. Atualize o `import` correspondente para apontar para o novo arquivo.
3. Remova o arquivo de placeholder antigo.
