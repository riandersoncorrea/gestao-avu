import { cn } from '@/lib/utils'

export interface TabItem {
  key: string
  label: string
}

export interface TabsProps {
  tabs: TabItem[]
  activeKey: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-gray-200', className)} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-graphite-700',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
