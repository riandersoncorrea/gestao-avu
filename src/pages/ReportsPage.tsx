import { FileBarChart } from 'lucide-react'
import { FeaturePlaceholder } from '@/pages/FeaturePlaceholder'

export function ReportsPage() {
  return (
    <FeaturePlaceholder
      title="Relatórios"
      description="Relatórios e laudos em PDF sobre AVUs e fiscalizações."
      icon={FileBarChart}
    />
  )
}
