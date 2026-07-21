import { CalendarClock } from 'lucide-react'
import { FeaturePlaceholder } from '@/pages/FeaturePlaceholder'

export function PlanningPage() {
  return (
    <FeaturePlaceholder
      title="Planejamento"
      description="Cronograma e priorização de execução das AVUs."
      icon={CalendarClock}
    />
  )
}
