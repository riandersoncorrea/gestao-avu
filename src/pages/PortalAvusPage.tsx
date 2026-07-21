import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { PortalAvuList } from '@/features/contractors/components/PortalAvuList'
import { listMyPortalAvus } from '@/features/contractors/portalService'

export function PortalAvusPage() {
  const avusQuery = useQuery({ queryKey: ['portal', 'avus'], queryFn: listMyPortalAvus })

  return (
    <div>
      <PageHeader title="Meus AVUs" description="AVUs atribuídas à sua empresa." />
      <PortalAvuList avus={avusQuery.data ?? []} isLoading={avusQuery.isLoading} />
    </div>
  )
}
