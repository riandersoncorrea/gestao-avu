-- Gestão de AVU — Serviços Operacionais São Luís EFC
-- Migration 0012: o bucket `avu-import-staging` (0008) foi criado só com
-- `allowed_mime_types = ['application/pdf']` — quando a Edge Function
-- corrigida passou a subir as imagens extraídas do PDF pro mesmo bucket
-- (pra tela de revisão mostrar miniaturas antes da confirmação, ver
-- migration 0011), todo upload de imagem era rejeitado pelo Storage
-- silenciosamente (erro capturado e ignorado em `stageExtractedImages`,
-- ver index.ts) — confirmado testando com um PDF real em produção
-- (ver docs/testing.md).

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg']
where id = 'avu-import-staging';
