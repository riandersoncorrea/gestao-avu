import { type InputHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId

    return (
      // `min-w-0`: sem isso, dentro de um CSS Grid/flex este wrapper (o item filho
      // direto do grid) herda `min-width: auto` — trava a coluna no tamanho mínimo do
      // conteúdo do <input>. Para `type="date"` isso só aparece com um valor preenchido
      // (o texto formatado + o ícone nativo do calendário força uma largura mínima maior),
      // e no Safari iOS isso empurra o campo pra fora do container. Confirmado num iPhone
      // real — não aparecia no Chrome desktop (onde o <input type="date"> tem outro
      // comportamento de min-width nativo).
      <div className="flex min-w-0 flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-graphite-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-graphite-800',
            'placeholder:text-gray-400',
            'focus:border-primary-500 focus:outline focus:outline-2 focus:outline-primary-100',
            'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400',
            error && 'border-magenta-500 focus:outline-magenta-100',
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-xs text-magenta-600">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-gray-500">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
