/**
 * Billing Success Page
 * Route: /billing/success
 *
 * Displays a warm, responsive success state after Stripe payment completes.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import { billingKeys } from '@/api/billing';
import GradientButton from '@/components/billing/GradientButton';

export default function BillingSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState(5);

  const sessionId = searchParams.get('session_id');
  const context = searchParams.get('context') || 'token_purchase';
  const workspaceId = searchParams.get('workspace_id');
  const productKey = searchParams.get('product_key');
  const quantity = searchParams.get('quantity');
  const planKey = searchParams.get('plan_key');
  const billingCycle = searchParams.get('billing_cycle');

  const isWorkspaceContext = context === 'workspace_subscription' && !!workspaceId;
  const redirectPath = isWorkspaceContext && workspaceId
    ? `/workspaces/${workspaceId}/billing`
    : '/billing';

  const detailItems = useMemo(() => {
    if (isWorkspaceContext) {
      return [
        workspaceId && { label: 'Workspace', value: workspaceId },
        planKey && { label: 'Plan', value: planKey.replace(/_/g, ' ') },
        billingCycle && { label: 'Billing Cycle', value: billingCycle },
      ].filter(Boolean) as { label: string; value?: string | null }[];
    }

    return [
      productKey && { label: 'Token Pack', value: productKey },
      quantity && { label: 'Quantity', value: quantity },
      workspaceId && { label: 'Workspace Charged', value: workspaceId },
    ].filter(Boolean) as { label: string; value?: string | null }[];
  }, [isWorkspaceContext, workspaceId, productKey, quantity, planKey, billingCycle]);

  const title = isWorkspaceContext ? 'Subscription Activated' : 'Tokens Added Successfully';
  const message = isWorkspaceContext
    ? 'Workspace billing is now active. Future renewals will use the assigned billing owner.'
    : 'Your token balance has been updated and is ready to use across the platform.';

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown !== 0) return;

    queryClient.invalidateQueries({ queryKey: billingKeys.user.products() });
    queryClient.invalidateQueries({ queryKey: billingKeys.user.transactions({}) });
    queryClient.invalidateQueries({ queryKey: billingKeys.user.profile() });

    if (isWorkspaceContext && workspaceId) {
      queryClient.invalidateQueries({ queryKey: billingKeys.workspace.all(workspaceId) });
    }

    router.push(redirectPath);
  }, [countdown, queryClient, isWorkspaceContext, workspaceId, router, redirectPath]);

  const handleGoBack = () => {
    queryClient.invalidateQueries({ queryKey: billingKeys.user.products() });
    queryClient.invalidateQueries({ queryKey: billingKeys.user.transactions({}) });
    queryClient.invalidateQueries({ queryKey: billingKeys.user.profile() });

    if (isWorkspaceContext && workspaceId) {
      queryClient.invalidateQueries({ queryKey: billingKeys.workspace.all(workspaceId) });
    }

    router.push(redirectPath);
  };

  return (
    <div className="success-page" data-testid="stripe-success-page">
      <div className="success-card">
        <div className="success-icon">
          <svg className="checkmark" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="success-title">{title}</h1>
        <p className="success-message">{message}</p>

        {sessionId && (
          <div className="session-info">
            <code>Session ID: {sessionId}</code>
          </div>
        )}

        <div className="countdown-section">
          <p className="countdown-text">
            Redirecting in{' '}
            <span className="countdown-number" data-testid="countdown">{countdown}</span>{' '}
            second{countdown !== 1 ? 's' : ''} ...
          </p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(countdown / 5) * 100}%` }} />
          </div>
        </div>

        <div className="action-buttons">
          <GradientButton onClick={handleGoBack} size="lg" data-testid="redirect-button">
            {isWorkspaceContext ? 'Go to Workspace Billing' : 'Go to Billing Dashboard'}
          </GradientButton>
        </div>

        {detailItems.length > 0 && (
          <div className="detail-panel">
            <h2>Order Summary</h2>
            <dl>
              {detailItems.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <p className="footer-note">Thank you for your purchase. Your transaction has been completed successfully.</p>
      </div>

      <style jsx>{`
        .success-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #fff7f2 0%, #fdf2f8 40%, #fef3c7 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: ${BillingSpacing.lg};
        }

        .success-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing['2xl']};
          max-width: 520px;
          width: 100%;
          text-align: center;
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${BillingColors.borderLight};
        }

        .success-icon {
          display: flex;
          justify-content: center;
          margin-bottom: ${BillingSpacing.lg};
        }

        .checkmark {
          color: #10b981;
          animation: scaleIn 0.5s ease-out;
        }

        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .success-title {
          font-size: 2rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          margin: 0 0 ${BillingSpacing.md};
        }

        .success-message {
          font-size: 1.1rem;
          color: ${BillingColors.textMedium};
          margin: 0 0 ${BillingSpacing.lg};
          line-height: 1.6;
        }

        .session-info {
          background: rgba(249, 245, 255, 0.6);
          border-radius: ${BillingRadius.sm};
          padding: ${BillingSpacing.md};
          margin-bottom: ${BillingSpacing.lg};
          display: inline-block;
        }

        .session-info code {
          font-size: 0.875rem;
          color: ${BillingColors.textMuted};
          font-family: 'Monaco', 'Courier New', monospace;
        }

        .countdown-section {
          margin-bottom: ${BillingSpacing.xl};
        }

        .countdown-text {
          font-size: 0.875rem;
          color: ${BillingColors.textMuted};
          margin: 0 0 ${BillingSpacing.md};
        }

        .countdown-number {
          font-weight: 700;
          color: #10b981;
          font-size: 1.125rem;
        }

        .progress-bar {
          position: relative;
          width: 100%;
          height: 0.5rem;
          background: ${BillingGradients.full};
          border-radius: ${BillingRadius.full};
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(135deg, #22c55e, #14b8a6);
          transition: width 0.4s ease;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
          margin-bottom: ${BillingSpacing.lg};
        }

        .detail-panel {
          background: rgba(249, 245, 255, 0.55);
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
          margin-bottom: ${BillingSpacing.lg};
          text-align: left;
        }

        .detail-panel h2 {
          margin: 0 0 ${BillingSpacing.sm};
          font-size: 1rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
        }

        dl {
          margin: 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: ${BillingSpacing.sm};
        }

        dl div {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        dt {
          font-size: 0.75rem;
          font-weight: 600;
          color: ${BillingColors.textMuted};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        dd {
          margin: 0;
          color: ${BillingColors.textStrong};
          font-weight: 600;
        }

        .footer-note {
          font-size: 0.75rem;
          color: #9ca3af;
          margin: 0;
        }

        @media (max-width: 640px) {
          .success-card {
            padding: ${BillingSpacing.lg};
          }

          .success-title {
            font-size: 1.5rem;
          }

          .success-message {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
