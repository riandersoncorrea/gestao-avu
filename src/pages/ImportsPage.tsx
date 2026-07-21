import { Upload } from 'lucide-react'
import { FeaturePlaceholder } from '@/pages/FeaturePlaceholder'

export function ImportsPage() {
  return (
    <FeaturePlaceholder
      title="Importações"
      description="Importação de dados externos (planilhas, SAP PM, sistemas legados)."
      icon={Upload}
    />
  )
}
