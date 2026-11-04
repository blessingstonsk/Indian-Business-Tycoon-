import { create } from 'zustand';

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.tone === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (message: string) => useToasts.getState().push({ tone: 'info', message }),
  success: (message: string) => useToasts.getState().push({ tone: 'success', message }),
  error: (message: string, correlationId?: string) =>
    useToasts.getState().push({ tone: 'error', message, detail: correlationId ? `Ref: ${correlationId.slice(0, 8)}` : undefined }),
};

/** Show an API error as a toast. */
export function reportError(e: unknown) {
  const err = e as { message?: string; correlationId?: string };
  toast.error(err.message ?? 'Something went wrong', err.correlationId);
}
