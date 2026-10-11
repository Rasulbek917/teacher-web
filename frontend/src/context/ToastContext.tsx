import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

const STYLES: Record<ToastType, { icon: React.ReactNode; ring: string }> = {
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    ring: 'border-emerald-100 dark:border-emerald-500/20',
  },
  error: {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    ring: 'border-red-100 dark:border-red-500/20',
  },
  info: {
    icon: <Info className="h-5 w-5 text-sky-500" />,
    ring: 'border-sky-100 dark:border-sky-500/20',
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white/95 px-4 py-3 text-sm shadow-pop backdrop-blur animate-slide-up dark:bg-slate-900/95 ${STYLES[t.type].ring}`}
            role="status"
          >
            <span className="mt-0.5 shrink-0">{STYLES[t.type].icon}</span>
            <span className="flex-1 font-medium text-slate-800 dark:text-slate-100">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="-mr-1 -mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
