/**
 * PlanSnapshot Component
 * Displays current workspace subscription plan details
 */

import React from 'react';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingShadows,
  BillingSpacing,
} from '@/design/billing.tokens';
import { WorkspaceSubscription, formatCurrency, formatDate } from '@/api/billing';

type HighlightTone = 'info' | 'warning' | 'danger';

export interface PlanSnapshotProps {
  /**
   * Subscription data
   */
  subscription: WorkspaceSubscription | null;
  /**
   * Auto-renew toggle handler
   */
  onToggle?: (enabled: boolean) => void;
  /**
   * Tooltip for disabled toggle
   */
  toggleDisabledReason?: string;
  /**
   * Loading state
   */
  loading?: boolean;
  /**
   * Optional CSS class
   */
  className?: string;
  /**
   * Optional banner to draw attention to plan events.
   */
  highlight?: {
    tone: HighlightTone;
    message: string;
  } | null;
}

export default function PlanSnapshot({
  subscription,
  onToggle,
  toggleDisabledReason,
  loading = false,
  className = '',
  highlight = null,
}: PlanSnapshotProps) {
  if (loading) {
    return (
      <div className={`plan-snapshot skeleton ${className}`}>
        <div className="skeleton-bar" />
        <div className="skeleton-bar" />
        <div className="skeleton-bar" />
        <style jsx>{`
          .plan-snapshot.skeleton {
            background: white;
            border-radius: ${BillingRadius.lg};
            padding: ${BillingSpacing.lg};
            border: 2px solid ${BillingColors.borderLight};
            display: flex;
            flex-direction: column;
            gap: ${BillingSpacing.md};
          }
          .skeleton-bar {
            height: 1.5rem;
            background: #e5e7eb;
            border-radius: ${BillingRadius.sm};
          }
        `}</style>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className={`plan-snapshot empty ${className}`}>
        <div className="empty-icon">📋</div>
        <div className="empty-text">
          <h3>No Active Subscription</h3>
          <p>This workspace is currently on the free plan.</p>
        </div>
        <style jsx>{`
          .plan-snapshot.empty {
            background: rgba(255, 255, 255, 0.95);
            border-radius: ${BillingRadius.lg};
            padding: ${BillingSpacing.xl};
            border: 2px dashed ${BillingColors.borderLight};
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: ${BillingSpacing.md};
          }
          .empty-icon {
            font-size: 3rem;
            opacity: 0.6;
          }
          .empty-text h3 {
            margin: 0;
            color: ${BillingColors.textStrong};
            font-size: 1.125rem;
          }
          .empty-text p {
            margin: ${BillingSpacing.xs} 0 0;
            color: ${BillingColors.textMuted};
            font-size: 0.875rem;
          }
        `}</style>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: BillingColors.success,
    trialing: BillingColors.info,
    past_due: BillingColors.warning,
    canceled: BillingColors.danger,
    unpaid: BillingColors.danger,
    incomplete: BillingColors.warning,
  };

  const statusColor = statusColors[subscription.status] || BillingColors.textMuted;
  const isToggleDisabled = Boolean(toggleDisabledReason) || !onToggle;

  const planName = subscription.plan?.name || subscription.plan_key || 'Unknown Plan';
  const planCurrency = subscription.plan?.currency || 'AUD';
  const monthlyPrice = subscription.plan?.monthly_price
    ? formatCurrency(subscription.plan.monthly_price, planCurrency)
    : null;
  const seatLimit =
    typeof subscription.plan?.max_users === 'number'
      ? `${subscription.plan.max_users.toLocaleString()} seats`
      : null;
  const storageLimit =
    typeof subscription.plan?.max_storage_gb === 'number'
      ? `${subscription.plan.max_storage_gb} GB storage`
      : null;
  const pendingPlanName = subscription.pending_plan?.name || subscription.pending_plan?.key;
  const trialEndsAt = subscription.trial_end ? formatDate(subscription.trial_end) : null;
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
      ? `${formattedPeriodStart} - ${formattedPeriodEnd}`
      : `${formattedPeriodStart} - Pending renewal`;
  } else if (formattedPeriodStart) {
    currentPeriodDisplay = `${formattedPeriodStart} - Pending renewal`;
  } else if (formattedPeriodEnd) {
    currentPeriodDisplay = `Through ${formattedPeriodEnd}`;
  }

  return (
    <div className={`plan-snapshot ${className}`}>
      {highlight && (
        <div className={`plan-highlight ${highlight.tone}`} role="status">
          {highlight.message}
        </div>
      )}
      <div className="snapshot-header">
        <div className="plan-info">
          <h3 className="plan-name">{planName}</h3>
          <span className="plan-status" style={{ color: statusColor }}>
            {subscription.status}
          </span>
        </div>
        <div className="plan-chips">
          {pendingPlanName && <span className="chip info">Plan change scheduled</span>}
          {trialEndsAt && <span className="chip">Trial ends {trialEndsAt}</span>}
          {subscription.auto_renew_enabled ? (
            <span className="chip success">Auto renew on</span>
          ) : (
            <span className="chip muted">Auto renew off</span>
          )}
        </div>
      </div>

      <div className="snapshot-body">
        {monthlyPrice && (
          <div className="info-row">
            <span className="info-label">Monthly Price</span>
            <span className="info-value">{monthlyPrice}</span>
          </div>
        )}

        {(seatLimit || storageLimit) && (
          <div className="info-row limits">
            <span className="info-label">Included Limits</span>
            <span className="info-value">
              {[seatLimit, storageLimit].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}

        <div className="info-row">
          <span className="info-label">Current Period</span>
          <span className="info-value">{currentPeriodDisplay}</span>
        </div>

        {pendingPlanName && (
          <div className="info-row pending">
            <span className="info-label">Scheduled Change</span>
            <span className="info-value">
              Pending switch to <strong>{pendingPlanName}</strong> next cycle
            </span>
          </div>
        )}

        <div className="info-row">
          <span className="info-label">Auto Renew</span>
          <label className="toggle-wrapper">
            <input
              type="checkbox"
              checked={subscription.auto_renew_enabled}
              onChange={(e) => onToggle?.(e.target.checked)}
              disabled={isToggleDisabled}
              title={toggleDisabledReason}
              className="toggle-input"
              data-testid="auto-renew-toggle"
              aria-label="Toggle auto renew"
            />
            <span className="toggle-slider" />
            <span className="toggle-label">
              {subscription.auto_renew_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {subscription.latest_invoice_message && (
          <div className="info-row invoice-message">
            <span className="info-label">Latest Invoice</span>
            <span className="info-value">
              {subscription.latest_invoice_message}
            </span>
          </div>
        )}
      </div>

      <style jsx>{`
        .plan-snapshot {
          position: relative;
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.lg};
          border: 2px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
          overflow: hidden;
        }

        .plan-highlight {
          border-radius: ${BillingRadius.md};
          padding: ${BillingSpacing.sm} ${BillingSpacing.md};
          font-size: 0.85rem;
          margin-bottom: ${BillingSpacing.md};
        }

        .plan-highlight.info {
          background: ${BillingColors.infoLight};
          color: ${BillingColors.info};
        }

        .plan-highlight.warning {
          background: ${BillingColors.warningLight};
          color: ${BillingColors.warning};
        }

        .plan-highlight.danger {
          background: ${BillingColors.dangerLight};
          color: ${BillingColors.danger};
        }

        .snapshot-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: ${BillingSpacing.md};
          flex-wrap: wrap;
          gap: ${BillingSpacing.sm};
        }

        .plan-info {
          display: flex;
          align-items: baseline;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
        }

        .plan-name {
          font-size: 1.5rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          margin: 0;
          text-transform: capitalize;
        }

        .plan-status {
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .plan-chips {
          display: inline-flex;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.75rem;
          border-radius: ${BillingRadius.full};
          background: rgba(255, 255, 255, 0.6);
          font-size: 0.75rem;
          font-weight: 600;
          color: ${BillingColors.textMedium};
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .chip.info {
          background: rgba(139, 92, 246, 0.18);
          color: ${BillingColors.textAccent};
        }

        .chip.success {
          background: ${BillingColors.successLight};
          color: ${BillingColors.successDark};
        }

        .chip.muted {
          background: rgba(255, 255, 255, 0.45);
          color: ${BillingColors.textMuted};
        }

        .snapshot-body {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: ${BillingSpacing.md};
          padding: ${BillingSpacing.sm} 0;
          border-bottom: 1px solid ${BillingColors.borderLight};
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-row.pending {
          background: ${BillingColors.infoLight};
          padding: ${BillingSpacing.sm};
          border-radius: ${BillingRadius.sm};
          border-bottom: none;
        }

        .info-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: ${BillingColors.textMuted};
        }

        .info-value {
          font-size: 0.875rem;
          color: ${BillingColors.textStrong};
          text-align: right;
        }

        .limits .info-value {
          display: inline-flex;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
        }

        .invoice-message .info-value {
          font-size: 0.85rem;
          color: ${BillingColors.textMuted};
        }

        .info-value strong {
          color: ${BillingColors.textStrong};
        }

        /* Toggle Switch */
        .toggle-wrapper {
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.sm};
          cursor: pointer;
        }

        .toggle-input {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
          background: #d1d5db;
          border-radius: 12px;
          transition: background 0.2s ease;
        }

        .toggle-slider::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .toggle-input:checked + .toggle-slider {
          background: ${BillingColors.success};
        }

        .toggle-input:checked + .toggle-slider::after {
          transform: translateX(20px);
        }

        .toggle-input:disabled + .toggle-slider {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toggle-label {
          font-size: 0.875rem;
          color: ${BillingColors.textMedium};
          font-weight: 500;
        }

        .cancel-notice {
          background: ${BillingColors.warningLight};
          color: ${BillingColors.warningDark};
          padding: ${BillingSpacing.sm} ${BillingSpacing.md};
          border-radius: ${BillingRadius.sm};
          font-size: 0.875rem;
          border-left: 4px solid ${BillingColors.warning};
        }

        @media (max-width: 768px) {
          .plan-snapshot {
            padding: ${BillingSpacing.md};
            gap: ${BillingSpacing.sm};
          }

          .plan-name {
            font-size: 1.25rem;
          }

          .info-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .plan-chips {
            width: 100%;
          }

          .info-value {
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
}
