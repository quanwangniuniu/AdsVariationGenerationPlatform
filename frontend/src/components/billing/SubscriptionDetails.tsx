import React from 'react';
import {
  BillingColors,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import { WorkspaceSubscription, formatDate } from '@/api/billing';
import GradientButton from './GradientButton';

export interface SubscriptionDetailsProps {
  subscription: WorkspaceSubscription | null;
  loading?: boolean;
  onToggleAutoRenew?: (enabled: boolean) => void;
  onCancelAtPeriodEnd?: () => void;
  onResume?: () => void;
  className?: string;
}

export default function SubscriptionDetails({
  subscription,
  loading = false,
  onToggleAutoRenew,
  onCancelAtPeriodEnd,
  onResume,
  className = '',
}: SubscriptionDetailsProps) {
  if (loading) {
    return (
      <div className={`subscription-card skeleton ${className}`}>
        <div className="skeleton-bar" />
        <div className="skeleton-bar" />
        <div className="skeleton-bar" />
        <style jsx>{`
          .subscription-card.skeleton {
            background: rgba(255, 255, 255, 0.8);
            border-radius: ${BillingRadius.xl};
            padding: ${BillingSpacing.lg};
            border: 1px solid ${BillingColors.borderLight};
            box-shadow: ${BillingShadows.card};
            display: flex;
            flex-direction: column;
            gap: ${BillingSpacing.md};
          }

          .skeleton-bar {
            height: 1.5rem;
            background: rgba(229, 231, 235, 0.8);
            border-radius: ${BillingRadius.sm};
            animation: shimmer 1.2s infinite;
          }

          @keyframes shimmer {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
          }
        `}</style>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className={`subscription-card empty ${className}`}>
        <div className="empty-illustration">🌱</div>
        <h3>No Active Subscription</h3>
        <p>Your workspace is currently on the free plan.</p>
        <style jsx>{`
          .subscription-card.empty {
            background: rgba(255, 255, 255, 0.85);
            border-radius: ${BillingRadius.xl};
            padding: ${BillingSpacing.lg};
            border: 2px dashed ${BillingColors.borderLight};
            box-shadow: ${BillingShadows.card};
            text-align: center;
          }

          .empty-illustration {
            font-size: 2.5rem;
            margin-bottom: ${BillingSpacing.md};
          }

          h3 {
            margin: 0;
            font-size: 1.2rem;
            color: ${BillingColors.textStrong};
          }

          p {
            margin-top: ${BillingSpacing.xs};
            color: ${BillingColors.textMuted};
          }
        `}</style>
      </div>
    );
  }

  const rawPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start)
    : null;
  const rawPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const formattedPeriodStart = rawPeriodStart
    ? formatDate(subscription.current_period_start)
    : null;
  const formattedPeriodEnd = rawPeriodEnd
    ? formatDate(subscription.current_period_end)
    : null;
  const hasCompleteWindow =
    rawPeriodStart !== null && rawPeriodEnd !== null && rawPeriodEnd.getTime() > rawPeriodStart.getTime();

  let currentPeriodDisplay = '—';
  if (formattedPeriodStart && formattedPeriodEnd) {
    currentPeriodDisplay = hasCompleteWindow
      ? `${formattedPeriodStart} – ${formattedPeriodEnd}`
      : `${formattedPeriodStart} – Pending renewal`;
  } else if (formattedPeriodStart) {
    currentPeriodDisplay = `${formattedPeriodStart} – Pending renewal`;
  } else if (formattedPeriodEnd) {
    currentPeriodDisplay = `Through ${formattedPeriodEnd}`;
  }

  const nextRenewal = formattedPeriodEnd ?? 'Not available';

  const planName = subscription.plan?.name || subscription.plan_key || 'Unknown plan';
  const autoRenewEnabled = subscription.auto_renew_enabled;

  return (
    <div className={`subscription-card ${className}`}>
      <header className="card-header">
        <div>
          <div className="plan-label">Current Plan</div>
          <h3 className="plan-name">{planName}</h3>
        </div>
        <span className={`status-chip status-${subscription.status}`}>
          {subscription.status.replace(/_/g, ' ')}
        </span>
      </header>

      <div className="card-body">
        <div className="info">
          <span className="info-label">Billing Cycle</span>
          <span className="info-value">
            {subscription.pending_change?.target_plan
              ? 'Upgrade scheduled'
              : autoRenewEnabled
              ? 'Auto-renew enabled'
              : 'Manual renewal'}
          </span>
        </div>

        <div className="info">
          <span className="info-label">Current Period</span>
          <span className="info-value">{currentPeriodDisplay}</span>
        </div>

        <div className="info">
          <span className="info-label">Next Renewal</span>
          <span className="info-value">{nextRenewal}</span>
        </div>

        {subscription.pending_change && (
          <div className="pending">
            <span className="pending-title">Scheduled Change</span>
            <p>
              Switching to <strong>{subscription.pending_change.target_plan}</strong> on{' '}
              {subscription.pending_change.effective_date
                ? formatDate(subscription.pending_change.effective_date)
                : 'next period'}
            </p>
          </div>
        )}
      </div>

      <div className="card-footer">
        <div className="toggle">
          <span className="toggle-label">Auto Renew</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={autoRenewEnabled}
              onChange={(e) => onToggleAutoRenew?.(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="actions">
          {subscription.cancel_at_period_end ? (
            <GradientButton variant="secondary" size="sm" onClick={onResume}>
              Resume Renewal
            </GradientButton>
          ) : (
            <GradientButton variant="secondary" size="sm" onClick={onCancelAtPeriodEnd}>
              Cancel at Period End
            </GradientButton>
          )}
        </div>
      </div>

      <style jsx>{`
        .subscription-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .plan-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: ${BillingColors.textMuted};
        }

        .plan-name {
          margin: 0;
          font-size: 1.5rem;
          color: ${BillingColors.textStrong};
        }

        .status-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.35rem 0.8rem;
          border-radius: ${BillingRadius.full};
          font-size: 0.75rem;
          font-weight: 600;
          background: rgba(139, 92, 246, 0.1);
        }

        .status-active { color: ${BillingColors.success}; }
        .status-cancelled { color: ${BillingColors.danger}; }
        .status-past_due { color: ${BillingColors.warning}; }

        .card-body {
          display: grid;
          gap: ${BillingSpacing.md};
        }

        .info {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .info-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: ${BillingColors.textMuted};
        }

        .info-value {
          font-size: 1rem;
          color: ${BillingColors.textStrong};
          font-weight: 600;
        }

        .pending {
          background: rgba(249, 245, 255, 0.55);
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
          color: ${BillingColors.textMedium};
        }

        .pending-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: ${BillingColors.textAccent};
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: ${BillingSpacing.sm};
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.sm};
        }

        .toggle-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: ${BillingColors.textMedium};
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 46px;
          height: 24px;
        }

        .switch input { opacity: 0; width: 0; height: 0; }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(219, 234, 254, 0.8);
          transition: 0.3s;
          border-radius: 24px;
        }

        .slider::before {
          position: absolute;
          content: '';
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.15);
        }

        .switch input:checked + .slider {
          background: linear-gradient(135deg, #fb928e, #fbbf24, #c084fc);
        }

        .switch input:checked + .slider::before {
          transform: translateX(22px);
        }

        .actions {
          display: flex;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
        }

        @media (max-width: 640px) {
          .subscription-card {
            padding: ${BillingSpacing.md};
          }

          .card-footer {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
