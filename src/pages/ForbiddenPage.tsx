import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ROUTES } from '@/lib/routes'

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <EmptyState
        icon={ShieldX}
        title="Acesso negado"
        description="Seu perfil não tem permissão para acessar esta página."
        action={
          <Link
            to={ROUTES.dashboard}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
          >
            Voltar ao início
          </Link>
        }
      />
    </div>
  )
}
