import { ClipboardCheck } from 'lucide-react'
import { FeaturePlaceholder } from '@/pages/FeaturePlaceholder'

export function InspectionsPage() {
  return (
    <FeaturePlaceholder
      title="Fiscalização"
      description="Checklists e validação de serviços executados em campo."
      icon={ClipboardCheck}
    />
  )
}
