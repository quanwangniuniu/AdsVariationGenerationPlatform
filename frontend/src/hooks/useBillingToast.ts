import { useCallback, useState } from 'react';

interface ToastMessage {
  tone: 'success' | 'error' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function useBillingToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const pushToast = useCallback((newToast: ToastMessage) => {
    setToast(newToast);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    pushToast,
    dismissToast,
  };
}

