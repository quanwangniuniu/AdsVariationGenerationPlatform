import { useCallback, useRef, useState } from 'react';

export interface ClipboardState {
  isCopying: boolean;
  error: string | null;
  copy: (text: string) => Promise<boolean>;
}

const FALLBACK_TEXTAREA_ID = 'template-clipboard-fallback';

function ensureFallbackTextarea(): HTMLTextAreaElement {
  let textarea = document.getElementById(FALLBACK_TEXTAREA_ID) as HTMLTextAreaElement | null;
  if (!textarea) {
    textarea = document.createElement('textarea');
    textarea.id = FALLBACK_TEXTAREA_ID;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
  }
  return textarea;
}

export function useClipboard(): ClipboardState {
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recentTimeout = useRef<number | null>(null);

  const clearError = useCallback(() => {
    if (recentTimeout.current) {
      window.clearTimeout(recentTimeout.current);
    }
    recentTimeout.current = window.setTimeout(() => setError(null), 2500);
  }, []);

  const copy = useCallback(async (text: string) => {
    setIsCopying(true);
    setError(null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }

      const textarea = ensureFallbackTextarea();
      textarea.value = text;
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand('copy');
      if (!successful) {
        throw new Error('Clipboard copy command failed.');
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clipboard copy failed.';
      setError(message);
      clearError();
      return false;
    } finally {
      setIsCopying(false);
    }
  }, [clearError]);

  return {
    isCopying,
    error,
    copy,
  };
}

