/**
 * Toast Container Component
 */

import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import type { Toast } from '../hooks/useToast';

type ToastContainerProps = {
  toasts: Toast[];
  onRemove: (id: string) => void;
};

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => {
        const bgColor = {
          success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
          error: 'bg-red-500/20 border-red-500/30 text-red-400',
          info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
        }[toast.type];

        const Icon = {
          success: CheckCircle,
          error: XCircle,
          info: Info,
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`${bgColor} border rounded-lg p-4 shadow-lg min-w-[300px] max-w-[400px] flex items-start gap-3 animate-in slide-in-from-right`}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">{toast.message}</div>
            <button
              onClick={() => onRemove(toast.id)}
              className="flex-shrink-0 hover:opacity-70 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
