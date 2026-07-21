import { createContext, type ReactNode, use, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  title: string
  description?: string
  tone: ToastTone
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneConfig: Record<ToastTone, { icon: typeof Info; classes: string }> = {
  success: { icon: CheckCircle2, classes: 'border-secondary-200 text-secondary-700' },
  error: { icon: XCircle, classes: 'border-magenta-200 text-magenta-700' },
  warning: { icon: TriangleAlert, classes: 'border-gold-200 text-gold-800' },
  info: { icon: Info, classes: 'border-sky-200 text-sky-700' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { ...toast, id }])
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 5000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  return (
    <ToastContext value={{ show }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
          {toasts.map((toast) => {
            const { icon: Icon, classes } = toneConfig[toast.tone]
            return (
              <div
                key={toast.id}
                role="status"
                className={cn(
                  'flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg',
                  classes,
                )}
              >
                <Icon className="size-5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-graphite-800">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Fechar notificação"
                  className="text-gray-400 hover:text-graphite-600"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext>
  )
}

export function useToast() {
  const context = use(ToastContext)
  if (!context) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return context
}
