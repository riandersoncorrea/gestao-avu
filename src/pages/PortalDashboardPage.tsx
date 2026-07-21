import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { PortalDashboardStats } from '@/features/contractors/components/PortalDashboardStats'
import { PortalAvuList } from '@/features/contractors/components/PortalAvuList'
import { getPortalDashboardStats, listMyPortalAvus } from '@/features/contractors/portalService'

export function PortalDashboardPage() {
  const avusQuery = useQuery({ queryKey: ['portal', 'avus'], queryFn: listMyPortalAvus })

  return (
    <div>
      <PageHeader title="Dashboard" description="Acompanhamento das AVUs atribuídas à sua empresa." />

      {avusQuery.isLoading ? (
        <LoadingState />
      ) : (
        <>
          <PortalDashboardStats stats={getPortalDashboardStats(avusQuery.data ?? [])} />

          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-graphite-800">AVUs recentes</h2>
            <PortalAvuList avus={(avusQuery.data ?? []).slice(0, 5)} />
          </div>
        </>
      )}
    </div>
  )
}
