import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/Card'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/Badge'
import { StatusBadge } from '@/components/StatusBadge'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { useToast } from '@/components/Toast'
import { Tabs } from '@/components/Tabs'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { ROLE_LABELS } from '@/features/auth/permissions'
import {
  createInvite,
  listInvites,
  listRoles,
  listUsersWithRoles,
  revokeInvite,
  setUserActive,
  setUserRoles,
  type InviteWithRole,
  type UserWithRoles,
} from '@/services/adminUserService'
import { formatDateTime } from '@/utils/format'
import type { Role, RoleSlug } from '@/types'

type Tab = 'users' | 'invites'

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div>
      <PageHeader
        title="Administração"
        description="Usuários, perfis, permissões e convites de acesso."
      />

      <Tabs
        className="mb-4"
        tabs={[
          { key: 'users', label: 'Usuários' },
          { key: 'invites', label: 'Convites' },
        ]}
        activeKey={tab}
        onChange={(key) => setTab(key as Tab)}
      />

      {tab === 'users' ? <UsersPanel /> : <InvitesPanel />}
    </div>
  )
}

function UsersPanel() {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { user: currentUser } = useAuth()
  const rolesModal = useDisclosure()
  const deactivateDialog = useDisclosure()
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])

  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: listUsersWithRoles })
  const rolesQuery = useQuery({ queryKey: ['admin', 'roles'], queryFn: listRoles })

  const setRolesMutation = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      setUserRoles(userId, roleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      show({ tone: 'success', title: 'Perfis atualizados' })
      rolesModal.close()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao atualizar perfis', description: String(error) }),
  })

  const setActiveMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => setUserActive(userId, active),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      show({ tone: 'success', title: variables.active ? 'Usuário ativado' : 'Usuário desativado' })
      deactivateDialog.close()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao alterar status', description: String(error) }),
  })

  function openRolesModal(row: UserWithRoles) {
    setSelectedUser(row)
    setSelectedRoleIds(row.roles.map((r) => r.id))
    rolesModal.open()
  }

  function openDeactivateDialog(row: UserWithRoles) {
    setSelectedUser(row)
    deactivateDialog.open()
  }

  function toggleRole(roleId: string) {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    )
  }

  const columns: DataTableColumn<UserWithRoles>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (row) => (
        <div>
          <p className="font-medium text-graphite-800">{row.profile.fullName}</p>
          <p className="text-xs text-gray-500">{row.profile.email}</p>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Perfis',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.length === 0 ? (
            <span className="text-xs text-gray-400">Sem perfil</span>
          ) : (
            row.roles.map((role) => (
              <Badge key={role.id} color="primary">
                {ROLE_LABELS[role.name as RoleSlug] ?? role.name}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge
          tone={row.profile.isActive ? 'success' : 'neutral'}
          label={row.profile.isActive ? 'Ativo' : 'Inativo'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openRolesModal(row)}>
            Gerenciar perfis
          </Button>
          <Button
            variant={row.profile.isActive ? 'danger' : 'secondary'}
            size="sm"
            disabled={row.profile.id === currentUser?.id}
            onClick={() => openDeactivateDialog(row)}
          >
            {row.profile.isActive ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <Card>
      <CardContent className="p-0">
        <DataTable
          data={usersQuery.data ?? []}
          columns={columns}
          getRowId={(row) => row.profile.id}
          isLoading={usersQuery.isLoading}
          emptyMessage="Nenhum usuário cadastrado ainda."
        />
      </CardContent>

      <Modal
        isOpen={rolesModal.isOpen}
        onClose={rolesModal.close}
        title={`Perfis de ${selectedUser?.profile.fullName ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={rolesModal.close}>
              Cancelar
            </Button>
            <Button
              isLoading={setRolesMutation.isPending}
              onClick={() =>
                selectedUser &&
                setRolesMutation.mutate({ userId: selectedUser.profile.id, roleIds: selectedRoleIds })
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {(rolesQuery.data ?? []).map((role: Role) => (
            <label key={role.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedRoleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                className="size-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-graphite-700">{ROLE_LABELS[role.name] ?? role.name}</span>
            </label>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deactivateDialog.isOpen}
        onClose={deactivateDialog.close}
        onConfirm={() =>
          selectedUser &&
          setActiveMutation.mutate({ userId: selectedUser.profile.id, active: !selectedUser.profile.isActive })
        }
        title={selectedUser?.profile.isActive ? 'Desativar usuário' : 'Ativar usuário'}
        description={
          selectedUser?.profile.isActive
            ? `${selectedUser?.profile.fullName} não conseguirá mais entrar no sistema.`
            : `${selectedUser?.profile.fullName} voltará a conseguir entrar no sistema.`
        }
        confirmLabel={selectedUser?.profile.isActive ? 'Desativar' : 'Ativar'}
        isDestructive={selectedUser?.profile.isActive}
        isLoading={setActiveMutation.isPending}
      />
    </Card>
  )
}

const inviteSchema = { email: '', roleId: '' }

function InvitesPanel() {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const { user } = useAuth()
  const revokeDialog = useDisclosure()
  const [form, setForm] = useState(inviteSchema)
  const [selectedInvite, setSelectedInvite] = useState<InviteWithRole | null>(null)

  const invitesQuery = useQuery({ queryKey: ['admin', 'invites'], queryFn: listInvites })
  const rolesQuery = useQuery({ queryKey: ['admin', 'roles'], queryFn: listRoles })

  const roleOptions = useMemo(
    () => (rolesQuery.data ?? []).map((role) => ({ value: role.id, label: ROLE_LABELS[role.name] ?? role.name })),
    [rolesQuery.data],
  )

  const createInviteMutation = useMutation({
    mutationFn: () => createInvite(form.email, form.roleId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
      show({ tone: 'success', title: 'Convite criado', description: form.email })
      setForm(inviteSchema)
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao criar convite', description: String(error) }),
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
      show({ tone: 'success', title: 'Convite revogado' })
      revokeDialog.close()
    },
    onError: (error) => show({ tone: 'error', title: 'Erro ao revogar convite', description: String(error) }),
  })

  const columns: DataTableColumn<InviteWithRole>[] = [
    { key: 'email', header: 'E-mail', render: (row) => row.email },
    { key: 'role', header: 'Perfil', render: (row) => ROLE_LABELS[row.roleName] ?? row.roleName },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.usedAt ? (
          <StatusBadge tone="neutral" label="Usado" />
        ) : (
          <StatusBadge tone="warning" label="Pendente" />
        ),
    },
    { key: 'createdAt', header: 'Criado em', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) =>
        row.usedAt ? null : (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setSelectedInvite(row)
              revokeDialog.open()
            }}
          >
            Revogar
          </Button>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              createInviteMutation.mutate()
            }}
          >
            <div className="flex-1">
              <Input
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
              />
            </div>
            <div className="flex-1">
              <Select
                label="Perfil"
                placeholder="Selecione um perfil"
                options={roleOptions}
                required
                value={form.roleId}
                onChange={(event) => setForm((f) => ({ ...f, roleId: event.target.value }))}
              />
            </div>
            <Button type="submit" isLoading={createInviteMutation.isPending}>
              <UserPlus className="size-4" />
              Convidar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={invitesQuery.data ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={invitesQuery.isLoading}
            emptyMessage="Nenhum convite criado ainda."
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={revokeDialog.isOpen}
        onClose={revokeDialog.close}
        onConfirm={() => selectedInvite && revokeInviteMutation.mutate(selectedInvite.id)}
        title="Revogar convite"
        description={`O convite para ${selectedInvite?.email} deixará de ser válido.`}
        confirmLabel="Revogar"
        isDestructive
        isLoading={revokeInviteMutation.isPending}
      />
    </div>
  )
}
