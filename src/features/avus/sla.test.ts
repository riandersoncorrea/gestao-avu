import { describe, expect, it } from 'vitest'
import { computeSlaStatus, daysOverdue, daysUntilDue } from './sla'

const REFERENCE = new Date('2026-07-21T12:00:00')

function isoDaysFromReference(days: number): string {
  const date = new Date(REFERENCE)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('daysUntilDue', () => {
  it('returns null when there is no due date', () => {
    expect(daysUntilDue(null, REFERENCE)).toBeNull()
  })

  it('returns 0 when the due date is today', () => {
    expect(daysUntilDue(isoDaysFromReference(0), REFERENCE)).toBe(0)
  })

  it('returns a positive number of days for a future due date', () => {
    expect(daysUntilDue(isoDaysFromReference(5), REFERENCE)).toBe(5)
  })

  it('returns a negative number of days for a past due date', () => {
    expect(daysUntilDue(isoDaysFromReference(-4), REFERENCE)).toBe(-4)
  })
})

describe('daysOverdue', () => {
  it('is 0 when there is no due date', () => {
    expect(daysOverdue(null, REFERENCE)).toBe(0)
  })

  it('is 0 when the due date has not passed', () => {
    expect(daysOverdue(isoDaysFromReference(2), REFERENCE)).toBe(0)
  })

  it('is the absolute number of late days when overdue', () => {
    expect(daysOverdue(isoDaysFromReference(-7), REFERENCE)).toBe(7)
  })
})

describe('computeSlaStatus', () => {
  it('is "no_prazo" with no due date set', () => {
    const info = computeSlaStatus(null, 'NOVO', REFERENCE)
    expect(info.tone).toBe('no_prazo')
  })

  it('is "no_prazo" comfortably before the deadline (> 3 days)', () => {
    const info = computeSlaStatus(isoDaysFromReference(10), 'EM_EXECUCAO', REFERENCE)
    expect(info.tone).toBe('no_prazo')
    expect(info.daysUntilDue).toBe(10)
  })

  it('is "proximo_vencimento" within the 3-day warning window', () => {
    const info = computeSlaStatus(isoDaysFromReference(2), 'EM_EXECUCAO', REFERENCE)
    expect(info.tone).toBe('proximo_vencimento')
    expect(info.daysUntilDue).toBe(2)
  })

  it('is "proximo_vencimento" when the deadline is today', () => {
    const info = computeSlaStatus(isoDaysFromReference(0), 'PROGRAMADO', REFERENCE)
    expect(info.tone).toBe('proximo_vencimento')
    expect(info.label).toBe('Vence hoje')
  })

  it('is "vencido" once the deadline has passed', () => {
    const info = computeSlaStatus(isoDaysFromReference(-3), 'AGUARDANDO_APROVACAO', REFERENCE)
    expect(info.tone).toBe('vencido')
    expect(info.daysOverdue).toBe(3)
  })

  it.each(['CONCLUIDO', 'REPROVADO', 'CANCELADO'] as const)(
    'is always "encerrado" for terminal status %s regardless of an overdue date',
    (status) => {
      const info = computeSlaStatus(isoDaysFromReference(-30), status, REFERENCE)
      expect(info.tone).toBe('encerrado')
      expect(info.daysOverdue).toBe(0)
    },
  )
})
