import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Tabs } from '@/components/Tabs'
import { listAvusForInspection } from '@/features/inspections/approvalService'
import { InspectionAvuList } from '@/features/inspections/components/InspectionAvuList'
import type { FiscalizacaoBucket } from '@/features/inspections/types'

const TABS: { key: FiscalizacaoBucket; label: string }[] = [
  { key: 'aguardando_aprovacao', label: 'Aguardando aprovação' },
  { key: 'aguardando_complementacao', label: 'Aguardando complementação' },
  { key: 'reprovados', label: 'Reprovados' },
  { key: 'aprovados', label: 'Aprovados' },
]

export function InspectionsPage() {
  const [bucket, setBucket] = useState<FiscalizacaoBucket>('aguardando_aprovacao')

  const avusQuery = useQuery({
    queryKey: ['inspections', bucket],
    queryFn: () => listAvusForInspection(bucket),
  })

  return (
    <div>
      <PageHeader title="Fiscalização" description="Análise e validação das evidências enviadas pelas contratadas." />

      <Tabs className="mb-4" tabs={TABS} activeKey={bucket} onChange={(key) => setBucket(key as FiscalizacaoBucket)} />

      <InspectionAvuList avus={avusQuery.data ?? []} isLoading={avusQuery.isLoading} />
    </div>
  )
}
