"use client";

import type { Toast } from "@/frontend/hooks/use-toast";

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => onRemove(toast.id)}
          role="alert"
        >
          <span>{toast.message}</span>
          <button aria-label="Cerrar">×</button>
        </div>
      ))}
    </div>
  );
}
