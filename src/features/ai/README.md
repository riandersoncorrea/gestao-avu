# features/ai

Espaço reservado para recursos de Inteligência Artificial e OCR no **frontend** (leitura automática de evidências, etc.).

**Status:** a classificação IA da importação de PDF (Sprint 9) já está implementada, mas vive em `supabase/functions/process-avu-import/lib/aiProviders.ts` — não aqui. A chave de API nunca pode chegar ao frontend, então toda a lógica de IA roda na Edge Function, não em `src/`. Ver `docs/architecture.md` ("Importação de PDF e abstração de `AIProvider`") e `features/imports/README.md`. Esta pasta segue reservada para um cenário onde IA/OCR client-side (ex.: sugestões instantâneas na UI, sem round-trip ao servidor) fizer sentido.
