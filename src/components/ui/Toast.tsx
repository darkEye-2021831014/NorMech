'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string; }

const Ctx = createContext<{
  push: (kind: ToastKind, message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useReducedMotion();

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 border bg-cardBg text-ink text-[13px] font-sans shadow-ink-2 rounded-sm',
                t.kind === 'error' && 'border-vermilion/60',
                t.kind === 'success' && 'border-olive/60',
                t.kind === 'info' && 'border-ink/30'
              )}
            >
              {t.kind === 'success' && <CheckCircle2 size={16} className="text-olive mt-0.5" strokeWidth={1.5} />}
              {t.kind === 'error' && <AlertTriangle size={16} className="text-vermilion mt-0.5" strokeWidth={1.5} />}
              {t.kind === 'info' && <span className="w-1 h-1 rounded-full bg-ink mt-2" />}
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
                className="text-inkMuted hover:text-ink"
                aria-label="Dismiss"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
