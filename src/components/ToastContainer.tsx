import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export interface ToastItem {
  id: string;
  severity: 'success' | 'info' | 'warning' | 'danger';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const tone =
          toast.severity === 'danger'
            ? 'bg-red-950 text-white border-red-800'
            : toast.severity === 'warning'
            ? 'bg-amber-950 text-amber-50 border-amber-800'
            : toast.severity === 'success'
            ? 'bg-emerald-950 text-emerald-50 border-emerald-800'
            : 'bg-[#0B1F3A] text-white border-slate-700';

        const Icon =
          toast.severity === 'danger'
            ? XCircle
            : toast.severity === 'warning'
            ? AlertTriangle
            : toast.severity === 'success'
            ? CheckCircle2
            : Info;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm transition-all ${tone}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="opacity-70 hover:opacity-100 transition-opacity p-0.5"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
