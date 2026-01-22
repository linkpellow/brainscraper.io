/**
 * Toast Container component - displays toast notifications
 */

import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import type { Toast, ToastType } from '../hooks/useToast';

type ToastContainerProps = {
  toasts: Toast[];
  onRemove: (id: string) => void;
};

const toastIcons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const toastStyles: Record<ToastType, string> = {
  success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
  error: 'bg-red-500/20 border-red-500/30 text-red-400',
  warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
  info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
};

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[2000] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.type];
        const style = toastStyles[toast.type];
        
        return (
          <div
            key={toast.id}
            className={`${style} border rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg backdrop-blur-xl min-w-[300px] max-w-[500px] pointer-events-auto animate-in slide-in-from-right-5`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => onRemove(toast.id)}
              className="text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
