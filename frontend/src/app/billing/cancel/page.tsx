/**
 * Billing Cancel Page
 * Route: /billing/cancel
 *
 * Displays a warm cancellation state when Stripe checkout is aborted.
 */

'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BillingColors,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import GradientButton from '@/components/billing/GradientButton';

export default function BillingCancelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const context = searchParams.get('context') || 'token_purchase';
  const workspaceId = searchParams.get('workspace_id');
  const productKey = searchParams.get('product_key');
  const planKey = searchParams.get('plan_key');

  const isWorkspaceContext = context === 'workspace_subscription' && !!workspaceId;
  const retryPath = isWorkspaceContext && workspaceId
    ? `/workspaces/${workspaceId}/billing`
    : '/billing';

  const title = isWorkspaceContext ? 'Subscription Cancelled' : 'Payment Cancelled';
  const message = isWorkspaceContext
    ? 'Your workspace subscription was not updated. No charges were applied.'
    : 'Your token purchase was cancelled and no charges were made.';

  const tip = useMemo(() => {
    if (isWorkspaceContext) {
      return planKey
        ? `You can retry upgrading to “${planKey.replace(/_/g, ' ')}” whenever you’re ready.`
        : 'You can retry the subscription upgrade whenever you’re ready.';
    }
    return productKey
      ? `Feel free to try purchasing the “${productKey}” token pack again.`
      : 'Feel free to try the purchase again whenever it suits you.';
  }, [isWorkspaceContext, planKey, productKey]);

  const handleRetry = () => {
    router.push(retryPath);
  };

  const handleGoHome = () => {
    router.push('/');
  };

  return (
    <div className="cancel-page" data-testid="stripe-cancel-page">
      <div className="cancel-card">
        <div className="cancel-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h1 className="cancel-title">{title}</h1>
        <p className="cancel-message">{message}</p>

        <div className="info-box">
          <span className="info-icon">ℹ️</span>
          <div>
            <strong>No worries.</strong>
            <p>{tip}</p>
          </div>
        </div>

        <div className="action-buttons">
          <GradientButton onClick={handleRetry} size="lg" data-testid="redirect-button">
            {isWorkspaceContext ? 'Back to Workspace Billing' : 'Return to Billing'}
          </GradientButton>
          <GradientButton onClick={handleGoHome} variant="secondary" size="lg" data-testid="home-button">
            Back to Home
          </GradientButton>
        </div>

        <p className="footer-note">
          Need help? Contact our support team for assistance.
        </p>
      </div>

      <style jsx>{`
        .cancel-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #fff7f2 0%, rgba(255, 224, 165, 0.65) 40%, #fde68a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: ${BillingSpacing.lg};
        }

        .cancel-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing['2xl']};
          max-width: 520px;
          width: 100%;
          text-align: center;
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${BillingColors.borderLight};
        }

        .cancel-icon {
          display: flex;
          justify-content: center;
          margin-bottom: ${BillingSpacing.lg};
        }

        .cancel-icon svg {
          color: #f59e0b;
          animation: shake 0.5s ease-in-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        .cancel-title {
          font-size: 2rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          margin: 0 0 ${BillingSpacing.md};
        }

        .cancel-message {
          font-size: 1.1rem;
          color: ${BillingColors.textMedium};
          margin: 0 0 ${BillingSpacing.lg};
          line-height: 1.6;
        }

        .info-box {
          background: rgba(255, 251, 235, 0.9);
          border: 2px solid #fde68a;
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
          margin-bottom: ${BillingSpacing.xl};
          display: flex;
          gap: ${BillingSpacing.md};
          text-align: left;
          align-items: flex-start;
        }

        .info-icon {
          font-size: 1.5rem;
        }

        .info-box strong {
          display: block;
          color: #92400e;
          margin-bottom: 0.35rem;
        }

        .info-box p {
          color: #78350f;
          font-size: 0.875rem;
          margin: 0;
          line-height: 1.5;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
          margin-bottom: ${BillingSpacing.lg};
        }

        .footer-note {
          font-size: 0.75rem;
          color: #9ca3af;
          margin: 0;
        }

        @media (max-width: 640px) {
          .cancel-card {
            padding: ${BillingSpacing.lg};
          }

          .cancel-title {
            font-size: 1.5rem;
          }

          .cancel-message {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
