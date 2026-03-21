import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Check, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info'

interface Toast { id: number; message: string; type: ToastType }
interface ToastCtx { toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function useToast() { return useContext(ToastContext) }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const id = Date.now()
    setCurrent({ id, message, type })
    timerRef.current = setTimeout(() => setCurrent(null), 3200)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
        {current && (
          <div key={current.id}
            className={cn(
              'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-2xl text-sm font-medium',
              'transition-all duration-200',
              current.type === 'success' && 'bg-zinc-900 border-green-500/40 text-zinc-100',
              current.type === 'error'   && 'bg-zinc-900 border-red-500/40 text-zinc-100',
              current.type === 'info'    && 'bg-zinc-900 border-zinc-600 text-zinc-300',
            )}>
            {current.type === 'success' && <Check       className="w-4 h-4 text-green-400 flex-shrink-0" />}
            {current.type === 'error'   && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
            {current.type === 'info'    && <Info        className="w-4 h-4 text-zinc-400 flex-shrink-0" />}
            {current.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
