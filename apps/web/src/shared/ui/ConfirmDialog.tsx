'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AlertTriangle, X } from 'lucide-react';

type ConfirmVariant = 'warning' | 'danger';

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type PendingConfirm = Required<Pick<ConfirmOptions, 'confirmLabel' | 'cancelLabel' | 'variant'>> &
  Pick<ConfirmOptions, 'title' | 'description'>;

const ConfirmDialogContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null
);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setPendingConfirm(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    resolveRef.current?.(false);

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPendingConfirm({
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? 'Підтвердити',
        cancelLabel: options.cancelLabel ?? 'Скасувати',
        variant: options.variant ?? 'warning',
      });
    });
  }, []);

  useEffect(() => {
    if (!pendingConfirm) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close(false);
      }
    };
    const previousOverflow = document.body.style.overflow;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, pendingConfirm]);

  useEffect(
    () => () => {
      resolveRef.current?.(false);
      resolveRef.current = null;
    },
    []
  );

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
          role="presentation"
          onMouseDown={() => close(false)}
        >
          <section
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="w-full max-w-md border border-(--nf-line-strong) bg-white shadow-xl"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-(--nf-line) bg-(--nf-panel-head) px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center border ${
                    pendingConfirm.variant === 'danger'
                      ? 'border-red-200 bg-red-50 text-(--nf-danger)'
                      : 'border-amber-200 bg-amber-50 text-(--nf-warning)'
                  }`}
                >
                  <AlertTriangle className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
                    {pendingConfirm.title}
                  </h2>
                  {pendingConfirm.description ? (
                    <div className="mt-1 text-sm leading-5 text-slate-600">
                      {pendingConfirm.description}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="nf-button nf-button-ghost min-h-8 px-2"
                aria-label="Закрити"
                onClick={() => close(false)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="nf-button nf-button-secondary"
                onClick={() => close(false)}
              >
                {pendingConfirm.cancelLabel}
              </button>
              <button
                type="button"
                className={`nf-button ${
                  pendingConfirm.variant === 'danger' ? 'nf-button-danger' : 'nf-button-primary'
                }`}
                onClick={() => close(true)}
              >
                {pendingConfirm.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmDialogContext);

  if (!confirm) {
    throw new Error('useConfirm must be used inside ConfirmDialogProvider');
  }

  return confirm;
}
