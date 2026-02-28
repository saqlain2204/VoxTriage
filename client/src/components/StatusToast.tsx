import { type FC, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

export type ToastType = "loading" | "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface StatusToastProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const ICON_MAP: Record<ToastType, FC<{ size: number; className?: string }>> = {
  loading: (p) => <Loader2 {...p} className="spin" />,
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const COLOR_MAP: Record<ToastType, string> = {
  loading: "var(--color-accent)",
  success: "var(--color-success)",
  error: "var(--color-danger)",
  info: "var(--color-info)",
};

export const StatusToast: FC<StatusToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    if (toast.type === "loading") return; // don't auto-dismiss loading
    const timer = setTimeout(() => onDismiss(toast.id), 3500);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onDismiss]);

  const Icon = ICON_MAP[toast.type];
  const color = COLOR_MAP[toast.type];

  return (
    <div
      className={`toast-item toast-item--${toast.type}`}
      style={{ borderLeftColor: color }}
      onClick={() => toast.type !== "loading" && onDismiss(toast.id)}
    >
      <Icon size={14} />
      <span>{toast.message}</span>
    </div>
  );
};
