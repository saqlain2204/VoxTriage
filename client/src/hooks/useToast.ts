import { useCallback, useState } from "react";
import type { Toast, ToastType } from "../components/StatusToast";

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string): string => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Replace a toast (e.g. loading → success). Returns the new id. */
  const updateToast = useCallback(
    (id: string, type: ToastType, message: string): string => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, type, message } : t)),
      );
      return id;
    },
    [],
  );

  return { toasts, addToast, removeToast, updateToast };
}
