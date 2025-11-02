/**
 * BillingStateBanner Component
 * Unified banner for workspace billing dashboard states.
 */

import React from 'react';
import {
  BillingColors,
  BillingRadius,
  BillingShadows,
  BillingSpacing,
  BillingTransitions,
} from '@/design/billing.tokens';
import GradientButton from './GradientButton';

export type BillingStatusTone = 'info' | 'success' | 'warning' | 'danger';

export type BillingDashboardBannerState =
  | 'unsubscribed'
  | 'trialing'
  | 'renewal-soon'
  | 'usage-warning'
  | 'usage-exceeded'
  | 'error';

export interface BannerAction {
  /**
   * CTA label
   */
  label: string;
  /**
   * Optional click handler for on-page actions
   */
  onClick?: () => void;
  /**
   * Button variant
   */
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * aria-label when action text needs clarification
   */
  ariaLabel?: string;
}

export interface BillingStateBannerProps {
  /**
   * Current high-level billing state
   */
  state: BillingDashboardBannerState;
  /**
   * Override default title
   */
  title?: string;
  /**
   * Override default description
   */
  description?: string;
  /**
   * Optional percentage (0-100) to display when warning about usage
   */
  usagePercent?: number | null;
  /**
   * ISO datetime string for upcoming renewal
   */
  renewalDate?: string | null;
  /**
   * Error code for troubleshooting context
   */
  errorCode?: string | null;
  /**
   * Primary CTA
   */
  action?: BannerAction;
  /**
   * Secondary CTA
   */
  secondaryAction?: BannerAction;
  /**
   * Optional dismiss handler (renders close icon)
   */
  onDismiss?: () => void;
  /**
   * Optional custom icon element
   */
  icon?: React.ReactNode;
  /**
   * Additional CSS class
   */
  className?: string;
  /**
   * Slot for extra content (e.g., bullet list)
   */
  children?: React.ReactNode;
}

const toneStyles: Record<BillingStatusTone, { background: string; text: string; border: string }> = {
  info: {
    background: 'rgba(139, 92, 246, 0.12)',
    text: BillingColors.textStrong,
    border: BillingColors.borderMedium,
  },
  success: {
    background: BillingColors.successLight,
    text: BillingColors.successDark,
    border: BillingColors.success,
  },
  warning: {
    background: BillingColors.warningLight,
    text: BillingColors.warningDark,
    border: BillingColors.warning,
  },
  danger: {
    background: BillingColors.dangerLight,
    text: BillingColors.dangerDark,
    border: BillingColors.danger,
  },
};

interface BannerDefaults {
  tone: BillingStatusTone;
  icon: string;
  title: string;
  description: string;
}

const bannerDefaults: Record<BillingDashboardBannerState, BannerDefaults> = {
  unsubscribed: {
    tone: 'info',
    icon: '🌱',
    title: 'Upgrade to unlock premium workspace features',
    description:
      'This workspace is on the Free plan. Upgrade to activate usage analytics, higher quotas, and premium support.',
  },
  trialing: {
    tone: 'info',
    icon: '✨',
    title: 'Trial in progress',
    description:
      'Make the most of your trial period. Add a payment method to continue uninterrupted once the trial ends.',
  },
  'renewal-soon': {
    tone: 'warning',
    icon: '⏰',
    title: 'Upcoming renewal',
    description: 'Review your billing details to avoid interruption as the renewal date approaches.',
  },
  'usage-warning': {
    tone: 'warning',
    icon: '📈',
    title: 'Usage nearing plan limits',
    description: 'You are approaching the allocated limits for this workspace. Consider upgrading your plan.',
  },
  'usage-exceeded': {
    tone: 'danger',
    icon: '🚨',
    title: 'Plan limits exceeded',
    description:
      'Workspace usage has exceeded the current plan limits. Some functionality may be restricted until you upgrade.',
  },
  error: {
    tone: 'danger',
    icon: '⚠️',
    title: 'Billing requires attention',
    description:
      'We were unable to process recent billing activity. Update your payment method or retry the payment to restore service.',
  },
};

function renderAction(action?: BannerAction) {
  if (!action) return null;
  const { label, onClick, variant = 'primary', ariaLabel } = action;
  const content = (
    <GradientButton
      variant={variant}
      size="sm"
      onClick={onClick}
      aria-label={ariaLabel}
      type="button"
    >
      {label}
    </GradientButton>
  );
  return content;
}

export default function BillingStateBanner({
  state,
  title,
  description,
  usagePercent,
  renewalDate,
  errorCode,
  action,
  secondaryAction,
  onDismiss,
  icon,
  className = '',
  children,
}: BillingStateBannerProps) {
  const defaults = bannerDefaults[state];
  const tone = toneStyles[defaults.tone];
  const resolvedTitle = title ?? defaults.title;
  const resolvedDescription = description ?? defaults.description;
  const resolvedIcon = icon ?? defaults.icon;

  return (
    <div className={`billing-state-banner ${className}`} role="status" data-tone={defaults.tone}>
      <div className="banner-body">
        <div className="banner-icon" aria-hidden="true">
          {resolvedIcon}
        </div>
        <div className="banner-copy">
          <div className="banner-header">
            <h3>{resolvedTitle}</h3>
            {onDismiss && (
              <button
                type="button"
                className="banner-dismiss"
                onClick={onDismiss}
                aria-label="Dismiss banner"
              >
                ×
              </button>
            )}
          </div>
          <p className="banner-description">{resolvedDescription}</p>
          <div className="banner-meta">
            {renewalDate && (
              <span className="meta-chip">
                Renews on&nbsp;
                <strong>{new Date(renewalDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}</strong>
              </span>
            )}
            {typeof usagePercent === 'number' && !Number.isNaN(usagePercent) && (
              <span className="meta-chip">
                Usage {usagePercent}% of plan
              </span>
            )}
            {errorCode && (
              <span className="meta-chip error">
                Error code: <strong>{errorCode}</strong>
              </span>
            )}
          </div>
          {children && <div className="banner-extra">{children}</div>}
        </div>
      </div>
      {(action || secondaryAction) && (
        <div className="banner-actions">
          {renderAction(action)}
          {renderAction(secondaryAction)}
        </div>
      )}

      <style jsx>{`
        .billing-state-banner {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
          padding: ${BillingSpacing.lg};
          border-radius: ${BillingRadius.xl};
          background: ${tone.background};
          color: ${tone.text};
          border: 1px solid ${tone.border};
          box-shadow: ${BillingShadows.card};
          transition: box-shadow ${BillingTransitions.base}, transform ${BillingTransitions.base};
        }

        .billing-state-banner:hover {
          box-shadow: ${BillingShadows.card};
          transform: translateY(-2px);
        }

        .banner-body {
          display: flex;
          gap: ${BillingSpacing.md};
          align-items: flex-start;
        }

        .banner-icon {
          font-size: 2rem;
          line-height: 1;
          flex-shrink: 0;
        }

        .banner-copy {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
        }

        .banner-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: ${BillingSpacing.sm};
        }

        h3 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 700;
        }

        .banner-description {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.6;
        }

        .banner-meta {
          display: flex;
          flex-wrap: wrap;
          gap: ${BillingSpacing.sm};
        }

        .meta-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.35rem 0.65rem;
          border-radius: ${BillingRadius.md};
          background: rgba(255, 255, 255, 0.5);
          font-size: 0.8rem;
          font-weight: 600;
          color: ${BillingColors.textMedium};
        }

        .meta-chip.error {
          background: rgba(239, 68, 68, 0.15);
          color: ${BillingColors.dangerDark};
        }

        .banner-actions {
          display: flex;
          flex-wrap: wrap;
          gap: ${BillingSpacing.sm};
        }

        .banner-extra {
          font-size: 0.85rem;
          color: ${BillingColors.textMedium};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
        }

        .banner-dismiss {
          background: transparent;
          border: none;
          color: inherit;
          font-size: 1.125rem;
          cursor: pointer;
          transition: color ${BillingTransitions.base};
          padding: 0;
          line-height: 1;
        }

        .banner-dismiss:hover {
          color: ${BillingColors.textAccent};
        }

        @media (max-width: 768px) {
          .billing-state-banner {
            padding: ${BillingSpacing.md};
          }

          .banner-body {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
