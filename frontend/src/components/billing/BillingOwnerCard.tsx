import React from 'react';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import GradientButton from './GradientButton';

export interface BillingOwnerCardProps {
  owner?: {
    id: string;
    username?: string | null;
    email?: string | null;
  } | null;
  stripeCustomerId?: string | null;
  creditBalance?: string | null;
  loading?: boolean;
  error?: string | null;
  onRelease?: () => void;
  releaseDisabled?: boolean;
  releaseDisabledReason?: string;
  releasing?: boolean;
  className?: string;
  showSensitive?: boolean;
}

export default function BillingOwnerCard({
  owner,
  stripeCustomerId,
  creditBalance,
  loading = false,
  error = null,
  onRelease,
  releaseDisabled,
  releaseDisabledReason,
  releasing = false,
  className = '',
  showSensitive = false,
}: BillingOwnerCardProps) {
  const showRelease = Boolean(owner && onRelease);
  const revealSensitive = showSensitive && Boolean(stripeCustomerId || creditBalance);

  return (
    <div className={`owner-card ${className}`} data-testid="billing-owner-card">
      <div className="owner-header">
        <div className="owner-icon">🧾</div>
        <div className="owner-heading">
          <span className="owner-kicker">Billing Owner</span>
          <h3 className="owner-title">Workspace billing contact</h3>
          <p className="owner-subtitle">
            This member controls payment methods, invoices, and subscription changes.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="owner-skeleton">
          <div className="skeleton-bar large" />
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
        </div>
      ) : error ? (
        <div className="owner-error" role="alert">
          <span className="error-icon">⚠️</span>
          <div>
            <p className="error-title">Unable to load billing owner</p>
            <p className="error-text">{error}</p>
          </div>
        </div>
      ) : owner ? (
        <>
          <div className="owner-details" data-testid="billing-owner-details">
            <div className="owner-primary">
              <span className="owner-name">{owner.username || owner.email || 'Unknown user'}</span>
              {owner.email && owner.username && (
                <span className="owner-email">{owner.email}</span>
              )}
              <div className="owner-badges">
                <span className="badge accent">Owner</span>
                {showSensitive ? <span className="badge info">You can view sensitive data</span> : null}
              </div>
            </div>

            <div className="owner-meta">
              {revealSensitive ? (
                <>
                  {stripeCustomerId && (
                    <div className="meta-item">
                      <span className="meta-label">Stripe Customer</span>
                      <span className="meta-value">{stripeCustomerId}</span>
                    </div>
                  )}
                  {creditBalance && (
                    <div className="meta-item">
                      <span className="meta-label">Credit Balance</span>
                      <span className="meta-value">{creditBalance}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="meta-item masked">
                  <span className="meta-label">Sensitive details</span>
                  <span className="meta-value">Visible to billing owner only</span>
                </div>
              )}
            </div>
          </div>

          {showRelease && (
            <div className="owner-actions">
              <GradientButton
                variant="secondary"
                size="sm"
                onClick={onRelease}
                disabled={releaseDisabled || releasing}
                title={releaseDisabledReason}
                data-testid="release-ownership-button"
              >
                {releasing ? 'Releasing...' : 'Release Ownership'}
              </GradientButton>
              <p className="owner-hint">
                Transfers billing responsibilities to the next qualifying workspace member.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="owner-empty">
          <span className="empty-icon">🌸</span>
          <p>No billing owner assigned yet.</p>
          <p>
            The first member to complete a workspace purchase will become the billing owner.
          </p>
        </div>
      )}

      <style jsx>{`
        .owner-card {
          position: relative;
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.xl};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          padding: ${BillingSpacing.lg};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
          overflow: hidden;
        }

        .owner-header {
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.md};
        }

        .owner-icon {
          width: 48px;
          height: 48px;
          border-radius: ${BillingRadius.md};
          background: rgba(255, 255, 255, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          box-shadow: 0 8px 24px rgba(255, 184, 107, 0.2);
        }

        .owner-heading {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
        }

        .owner-kicker {
          font-size: 0.8rem;
          font-weight: 700;
          color: ${BillingColors.textAccent};
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .owner-title {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          letter-spacing: -0.01em;
        }

        .owner-subtitle {
          margin: 0;
          font-size: 0.9rem;
          color: ${BillingColors.textMuted};
          line-height: 1.6;
        }

        .owner-details {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .owner-primary {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
        }

        .owner-name {
          font-size: 1.2rem;
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .owner-email {
          font-size: 0.85rem;
          color: ${BillingColors.textMuted};
        }

        .owner-badges {
          display: inline-flex;
          gap: ${BillingSpacing.xs};
          flex-wrap: wrap;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.65rem;
          border-radius: ${BillingRadius.full};
          background: rgba(255, 255, 255, 0.6);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: ${BillingColors.textMedium};
        }

        .badge.accent {
          background: rgba(249, 168, 212, 0.3);
          color: ${BillingColors.textAccent};
        }

        .badge.info {
          background: rgba(139, 92, 246, 0.15);
          color: ${BillingColors.textAccent};
        }

        .owner-meta {
          display: grid;
          gap: ${BillingSpacing.sm};
          font-size: 0.85rem;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          padding: ${BillingSpacing.sm};
          background: rgba(255, 255, 255, 0.7);
          border-radius: ${BillingRadius.md};
        }

        .meta-item.masked {
          background: rgba(255, 255, 255, 0.5);
          font-style: italic;
          color: ${BillingColors.textMuted};
        }

        .meta-label {
          font-weight: 600;
          color: ${BillingColors.textMuted};
        }

        .meta-value {
          color: ${BillingColors.textStrong};
          word-break: break-all;
        }

        .owner-actions {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
        }

        .owner-hint {
          margin: 0;
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
        }

        .owner-empty {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: ${BillingSpacing.sm};
          font-size: 0.9rem;
          line-height: 1.6;
          color: ${BillingColors.textMuted};
          background: rgba(255, 255, 255, 0.8);
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
        }

        .empty-icon {
          font-size: 1.5rem;
        }

        .owner-skeleton {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
        }

        .skeleton-bar {
          height: 1rem;
          border-radius: ${BillingRadius.sm};
          background: rgba(255, 255, 255, 0.6);
          position: relative;
          overflow: hidden;
        }

        .skeleton-bar.large {
          height: 2rem;
          width: 70%;
        }

        .skeleton-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
          animation: shimmer 1.4s infinite;
        }

        .owner-error {
          display: flex;
          gap: ${BillingSpacing.md};
          align-items: flex-start;
          background: rgba(254, 226, 226, 0.85);
          border: 1px solid #fca5a5;
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
          color: ${BillingColors.dangerDark};
        }

        .error-icon {
          font-size: 1.25rem;
        }

        .error-title {
          margin: 0;
          font-weight: 600;
        }

        .error-text {
          margin: 0.25rem 0 0;
          font-size: 0.85rem;
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
