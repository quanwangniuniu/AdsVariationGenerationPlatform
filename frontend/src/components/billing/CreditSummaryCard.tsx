import React from 'react';
import {
  BillingColors,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import { formatCurrency } from '@/api/billing';

export interface CreditSummaryCardProps {
  balance?: string;
  currency?: string;
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  lastSyncedAt?: string | null;
  loading?: boolean;
  className?: string;
}

export default function CreditSummaryCard({
  balance = '0.00',
  currency = 'AUD',
  stripeCustomerId,
  defaultPaymentMethodId,
  lastSyncedAt,
  loading = false,
  className = '',
}: CreditSummaryCardProps) {
  const amountDisplay = formatCurrency(balance, currency);

  return (
    <div className={`credit-card ${className}`}>
      <div className="credit-header">
        <div className="credit-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="3" ry="3" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div className="credit-meta">
          <div className="credit-label">Account Credit</div>
          <div className="credit-subtitle">Reusable refunds & balance</div>
        </div>
      </div>

      <div className="credit-body">
        {loading ? (
          <div className="credit-skeleton">
            <div className="skeleton-bar large" />
            <div className="skeleton-bar small" />
          </div>
        ) : (
          <>
            <div className="credit-amount">{amountDisplay}</div>
            {lastSyncedAt && (
              <div className="credit-updated">
                Last synced: {new Date(lastSyncedAt).toLocaleString('en-AU')}
              </div>
            )}
          </>
        )}
      </div>

      {!loading && (
        <dl className="credit-details">
          {stripeCustomerId && (
            <div>
              <dt>Stripe Customer</dt>
              <dd>{stripeCustomerId}</dd>
            </div>
          )}
          {defaultPaymentMethodId && (
            <div>
              <dt>Default Payment Method</dt>
              <dd>{defaultPaymentMethodId}</dd>
            </div>
          )}
        </dl>
      )}

      <style jsx>{`
        .credit-card {
          background: rgba(248, 250, 252, 0.95);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
        }

        .credit-header {
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.md};
          margin-bottom: ${BillingSpacing.lg};
        }

        .credit-icon {
          width: 44px;
          height: 44px;
          border-radius: ${BillingRadius.md};
          background: linear-gradient(135deg, #38bdf8, #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .credit-meta {
          flex: 1;
        }

        .credit-label {
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: ${BillingColors.textMuted};
        }

        .credit-subtitle {
          margin-top: 0.25rem;
          color: ${BillingColors.textMedium};
          font-size: 0.95rem;
        }

        .credit-body {
          margin-bottom: ${BillingSpacing.lg};
        }

        .credit-amount {
          font-size: 2.1rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
        }

        .credit-updated {
          margin-top: ${BillingSpacing.sm};
          font-size: 0.75rem;
          color: ${BillingColors.textMedium};
        }

        .credit-skeleton {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
        }

        .skeleton-bar {
          background: #e5e7eb;
          border-radius: ${BillingRadius.sm};
          position: relative;
          overflow: hidden;
        }

        .skeleton-bar.large {
          height: 2.5rem;
          width: 70%;
        }

        .skeleton-bar.small {
          height: 1rem;
          width: 50%;
        }

        .skeleton-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.6) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: shimmer 1.4s infinite;
        }

        .credit-details {
          display: grid;
          gap: ${BillingSpacing.sm};
          font-size: 0.85rem;
          color: ${BillingColors.textMuted};
        }

        .credit-details div {
          display: flex;
          flex-direction: column;
        }

        .credit-details dt {
          font-weight: 600;
          color: ${BillingColors.textMedium};
        }

        .credit-details dd {
          margin: 0.2rem 0 0;
          color: ${BillingColors.textStrong};
          word-break: break-all;
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
