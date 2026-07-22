/**
 * Throttle client-side para `avu_generate_deadline_notifications` (migration 0010) — este
 * projeto não tem pg_cron habilitado (plano Supabase Free), então a checagem de prazo
 * próximo/vencido roda sob demanda quando alguém abre o app, no máximo uma vez a cada
 * `DEADLINE_CHECK_THROTTLE_MS`. A idempotência de verdade (não duplicar notificação) é
 * garantida no servidor; isso aqui só evita chamar a RPC a cada navegação de página.
 */
export const DEADLINE_CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000 // 6h

export function shouldRunDeadlineCheck(
  lastRunAt: number | null,
  now: number = Date.now(),
  thresholdMs: number = DEADLINE_CHECK_THROTTLE_MS,
): boolean {
  if (lastRunAt === null) return true
  return now - lastRunAt >= thresholdMs
}
