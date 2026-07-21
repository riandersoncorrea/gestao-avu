import { describe, expect, it } from 'vitest'
import { canWriteAvuRelated } from './permissions'

describe('canWriteAvuRelated', () => {
  it('is true for admin regardless of permissions', () => {
    expect(canWriteAvuRelated([], true)).toBe(true)
  })

  it('is true for avus.view_all (Segurança Empresarial, Planejamento)', () => {
    expect(canWriteAvuRelated(['avus.view_all'], false)).toBe(true)
  })

  it('is true for avus.view_assigned (Fiscal, Contratada)', () => {
    expect(canWriteAvuRelated(['avus.view_assigned'], false)).toBe(true)
  })

  it('is true for avus.view_area (Gestor)', () => {
    expect(canWriteAvuRelated(['avus.view_area'], false)).toBe(true)
  })

  it('is false for readonly.view alone (Leitor)', () => {
    expect(canWriteAvuRelated(['readonly.view'], false)).toBe(false)
  })

  it('is false with no permissions at all', () => {
    expect(canWriteAvuRelated([], false)).toBe(false)
  })
})
