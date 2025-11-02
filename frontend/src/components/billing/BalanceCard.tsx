/**
 * BalanceCard Component
 * Displays token balance with CTA slot
 */

import React from 'react';
import {
  BillingColors,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';

export interface BalanceCardProps {
  /**
   * Scope: 'user' or 'workspace'
   */
  scope: 'user' | 'workspace';
  /**
   * Token balance amount
   */
  balance: number;
  /**
   * Unit label (e.g., 'tokens')
   */
  unit?: string;
  /**
   * Last updated timestamp
   */
  lastUpdated?: string;
  /**
   * Workspace name (if scope is workspace)
   */
  workspaceName?: string;
  /**
   * Optional action slot (e.g., purchase button)
   */
  actions?: React.ReactNode;
  /**
   * Loading state
   */
  loading?: boolean;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function BalanceCard({
  scope,
  balance,
  unit = 'tokens',
  lastUpdated,
  workspaceName,
  actions,
  loading = false,
  className = '',
}: BalanceCardProps) {
  const scopeLabel = scope === 'user' ? 'Personal Account' : workspaceName || 'Workspace';

  return (
    <div className={`balance-card ${className}`} data-testid="balance-card">
      <div className="balance-header">
        <div className="balance-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <div className="balance-meta">
          <div className="balance-label">Token Balance</div>
          <div className="balance-scope">{scopeLabel}</div>
        </div>
      </div>

      <div className="balance-body">
        {loading ? (
          <div className="balance-skeleton">
            <div className="skeleton-bar large" />
            <div className="skeleton-bar small" />
          </div>
        ) : (
          <>
            <div className="balance-amount">
              {balance.toLocaleString('en-AU')}
              <span className="balance-unit">{unit}</span>
            </div>
            {lastUpdated && (
              <div className="balance-updated">
                Last updated: {new Date(lastUpdated).toLocaleString('en-AU')}
              </div>
            )}
          </>
        )}
      </div>

      {actions && <div className="balance-actions">{actions}</div>}

      <style jsx>{`
        .balance-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(16px);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          box-shadow: ${BillingShadows.card};
          border: 2px solid ${BillingColors.borderLight};
          transition: box-shadow 0.2s ease;
        }

        .balance-card:hover {
          box-shadow: ${BillingShadows.cardHover};
        }

        .balance-header {
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.md};
          margin-bottom: ${BillingSpacing.lg};
        }

        .balance-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #f9a8d4, #fbbf24);
          border-radius: ${BillingRadius.md};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .balance-meta {
          flex: 1;
          min-width: 0;
        }

        .balance-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: ${BillingColors.textMuted};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .balance-scope {
          font-size: 1rem;
          color: ${BillingColors.textStrong};
          margin-top: 0.25rem;
        }

        .balance-body {
          margin-bottom: ${BillingSpacing.lg};
        }

        .balance-amount {
          font-size: 2.5rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
        }

        .balance-unit {
          font-size: 1.25rem;
          font-weight: 500;
          color: ${BillingColors.textMuted};
          margin-left: 0.5rem;
        }

        .balance-updated {
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
          margin-top: ${BillingSpacing.sm};
        }

        .balance-skeleton {
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
          height: 3rem;
          width: 60%;
        }

        .skeleton-bar.small {
          height: 1rem;
          width: 40%;
        }

        .skeleton-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          to {
            left: 100%;
          }
        }

        .balance-actions {
          padding-top: ${BillingSpacing.md};
          border-top: 2px solid ${BillingColors.borderLight};
        }

        @media (max-width: 768px) {
          .balance-card {
            padding: ${BillingSpacing.md};
          }

          .balance-amount {
            font-size: 2rem;
          }

          .balance-unit {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
