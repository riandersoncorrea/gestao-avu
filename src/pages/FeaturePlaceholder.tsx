import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'

export interface FeaturePlaceholderProps {
  title: string
  description: string
  icon: LucideIcon
}

export function FeaturePlaceholder({ title, description, icon }: FeaturePlaceholderProps) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title="Em desenvolvimento"
        description="Este módulo será implementado em uma próxima sprint. Veja docs/roadmap.md."
      />
    </div>
  )
}
