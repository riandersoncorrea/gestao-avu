export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('pt-BR', options ?? { dateStyle: 'short' }).format(date)
}

export function formatDateTime(value: string | Date): string {
  return formatDate(value, { dateStyle: 'short', timeStyle: 'short' })
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('pt-BR', options).format(value)
}
