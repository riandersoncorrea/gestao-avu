import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSION_KEYS,
  derivePermissionSet,
  hasPermission,
  hasRole,
  isAdmin,
  type RawUserRoleRow,
} from './permissions'
import type { PermissionKey, RoleSlug } from '@/types'

function rowFor(roleName: RoleSlug, permissionKeys: PermissionKey[]): RawUserRoleRow {
  return {
    role: {
      name: roleName,
      role_permissions: permissionKeys.map((key) => ({ permissions: { key } })),
    },
  }
}

describe('derivePermissionSet', () => {
  it('resolves Segurança Empresarial permissions', () => {
    const { roles, permissions } = derivePermissionSet([
      rowFor('seguranca_empresarial', ['avus.view_all', 'avus.create', 'security.manage', 'history.view']),
    ])
    expect(roles).toEqual(['seguranca_empresarial'])
    expect(permissions.sort()).toEqual(
      ['avus.view_all', 'avus.create', 'security.manage', 'history.view'].sort(),
    )
  })

  it('resolves Planejamento permissions', () => {
    const { permissions } = derivePermissionSet([
      rowFor('planejamento', ['avus.view_all', 'planning.manage', 'noms.view']),
    ])
    expect(permissions.sort()).toEqual(['avus.view_all', 'planning.manage', 'noms.view'].sort())
  })

  it('resolves Fiscal permissions', () => {
    const { permissions } = derivePermissionSet([
      rowFor('fiscal', ['avus.view_assigned', 'evidence.analyze', 'execution.approve']),
    ])
    expect(permissions.sort()).toEqual(['avus.view_assigned', 'evidence.analyze', 'execution.approve'].sort())
  })

  it('resolves Contratada permissions', () => {
    const { permissions } = derivePermissionSet([rowFor('contratada', ['avus.view_assigned', 'evidence.submit'])])
    expect(permissions.sort()).toEqual(['avus.view_assigned', 'evidence.submit'].sort())
  })

  it('resolves Gestor permissions', () => {
    const { permissions } = derivePermissionSet([rowFor('gestor', ['indicators.view', 'avus.view_area'])])
    expect(permissions.sort()).toEqual(['indicators.view', 'avus.view_area'].sort())
  })

  it('resolves Leitor permissions', () => {
    const { permissions } = derivePermissionSet([rowFor('leitor', ['readonly.view'])])
    expect(permissions).toEqual(['readonly.view'])
  })

  it('grants every permission to admin regardless of seeded role_permissions', () => {
    const { roles, permissions } = derivePermissionSet([rowFor('admin', [])])
    expect(roles).toEqual(['admin'])
    expect(permissions.sort()).toEqual([...ALL_PERMISSION_KEYS].sort())
  })

  it('supports a user with more than one role (union of permissions)', () => {
    const { roles, permissions } = derivePermissionSet([
      rowFor('fiscal', ['avus.view_assigned', 'evidence.analyze', 'execution.approve']),
      rowFor('gestor', ['indicators.view', 'avus.view_area']),
    ])
    expect(roles.sort()).toEqual(['fiscal', 'gestor'])
    expect(permissions.sort()).toEqual(
      ['avus.view_assigned', 'evidence.analyze', 'execution.approve', 'indicators.view', 'avus.view_area'].sort(),
    )
  })

  it('ignores rows with a null role (defensive against orphaned joins)', () => {
    const { roles, permissions } = derivePermissionSet([{ role: null }])
    expect(roles).toEqual([])
    expect(permissions).toEqual([])
  })

  it('returns empty sets for an empty input', () => {
    const { roles, permissions } = derivePermissionSet([])
    expect(roles).toEqual([])
    expect(permissions).toEqual([])
  })
})

describe('hasPermission / hasRole / isAdmin', () => {
  it('hasPermission is true only for included keys', () => {
    expect(hasPermission(['avus.view_all'], 'avus.view_all')).toBe(true)
    expect(hasPermission(['avus.view_all'], 'avus.create')).toBe(false)
  })

  it('hasRole is true only for included roles', () => {
    expect(hasRole(['fiscal', 'gestor'], 'fiscal')).toBe(true)
    expect(hasRole(['fiscal'], 'admin')).toBe(false)
  })

  it('isAdmin reflects presence of the admin role', () => {
    expect(isAdmin(['admin'])).toBe(true)
    expect(isAdmin(['leitor'])).toBe(false)
    expect(isAdmin([])).toBe(false)
  })
})
