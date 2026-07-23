import { type SelectHTMLAttributes, forwardRef, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const generatedId = useId()
    const selectId = id ?? generatedId

    return (
      // `min-w-0`: mesmo motivo do Input.tsx — sem isso este wrapper (item filho direto
      // do grid) trava a coluna no tamanho mínimo do conteúdo.
      <div className="flex min-w-0 flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-graphite-700">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={Boolean(error)}
            className={cn(
              'h-10 w-full appearance-none rounded-xl border border-gray-300 bg-white px-3 pr-9 text-sm text-graphite-800',
              'focus:border-primary-500 focus:outline focus:outline-2 focus:outline-primary-100',
              'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400',
              error && 'border-magenta-500 focus:outline-magenta-100',
              className,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
        </div>
        {error && <p className="text-xs text-magenta-600">{error}</p>}
      </div>
    )
  },
)

Select.displayName = 'Select'
