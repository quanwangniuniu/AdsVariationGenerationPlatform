import React from 'react';
import {
  BillingRadius,
  BillingShadows,
  BillingSpacing,
} from '@/design/billing.tokens';

export type BillingToastTone = 'success' | 'error' | 'info';

export interface BillingToastProps {
  tone?: BillingToastTone;
  message: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

const tonePalette: Record<BillingToastTone, { bg: string; border: string; text: string }> = {
  success: {
    bg: 'linear-gradient(135deg, rgba(209, 250, 229, 0.96), rgba(134, 239, 172, 0.88))',
    border: '#86efac',
    text: '#064e3b',
  },
  error: {
    bg: 'linear-gradient(135deg, rgba(254, 226, 226, 0.95), rgba(252, 165, 165, 0.88))',
    border: '#fca5a5',
    text: '#7f1d1d',
  },
  info: {
    bg: 'linear-gradient(135deg, rgba(219, 234, 254, 0.95), rgba(196, 181, 253, 0.88))',
    border: '#a5b4fc',
    text: '#1e3a8a',
  },
};

export default function BillingToast({
  tone = 'info',
  message,
  onDismiss,
  actionLabel,
  onAction,
}: BillingToastProps) {
  const palette = tonePalette[tone];

  return (
    <div className={`billing-toast tone-${tone}`} role="status">
      <div className="toast-body">
        <p className="toast-message">{message}</p>
        {actionLabel && onAction && (
          <button type="button" className="toast-action" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="toast-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          Close
        </button>
      )}

      <style jsx>{`
        .billing-toast {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: ${BillingSpacing.sm};
          padding: ${BillingSpacing.md} ${BillingSpacing.lg};
          border-radius: ${BillingRadius.xl};
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${palette.border};
          background: ${palette.bg};
          color: ${palette.text};
          min-width: 280px;
        }

        .toast-body {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
          flex: 1;
        }

        .toast-message {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          line-height: 1.4;
        }

        .toast-action {
          align-self: flex-start;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          border: none;
          background: rgba(255, 255, 255, 0.65);
          color: ${palette.text};
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .toast-action:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(255, 255, 255, 0.35);
        }

        .toast-dismiss {
          border: none;
          background: transparent;
          color: inherit;
          font-weight: 600;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
        }

        .toast-dismiss:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .billing-toast {
            flex-direction: column;
            align-items: stretch;
          }

          .toast-dismiss {
            align-self: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
