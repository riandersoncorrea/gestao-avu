import { describe, expect, it } from 'vitest'
import { DEADLINE_CHECK_THROTTLE_MS, shouldRunDeadlineCheck } from './deadlineCheckThrottle'

describe('shouldRunDeadlineCheck', () => {
  it('roda quando nunca rodou antes', () => {
    expect(shouldRunDeadlineCheck(null)).toBe(true)
  })

  it('não roda se o intervalo ainda não passou', () => {
    const now = 1_000_000
    const lastRunAt = now - (DEADLINE_CHECK_THROTTLE_MS - 1)
    expect(shouldRunDeadlineCheck(lastRunAt, now)).toBe(false)
  })

  it('roda de novo assim que o intervalo passa', () => {
    const now = 1_000_000
    const lastRunAt = now - DEADLINE_CHECK_THROTTLE_MS
    expect(shouldRunDeadlineCheck(lastRunAt, now)).toBe(true)
  })

  it('respeita um threshold customizado', () => {
    expect(shouldRunDeadlineCheck(0, 150, 100)).toBe(true)
    expect(shouldRunDeadlineCheck(100, 150, 200)).toBe(false)
  })
})
