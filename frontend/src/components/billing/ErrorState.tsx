/**
 * ErrorState Component
 * Displays error message with optional retry action
 */

import React from 'react';
import { BillingColors, BillingRadius, BillingSpacing } from '@/design/billing.tokens';

export interface ErrorStateProps {
  /**
   * Error title
   */
  title: string;
  /**
   * Error description/message
   */
  description?: string;
  /**
   * Error code (optional)
   */
  code?: string;
  /**
   * Retry action handler
   */
  onRetry?: () => void;
  /**
   * Contact support action
   */
  onContactSupport?: () => void;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function ErrorState({
  title,
  description,
  code,
  onRetry,
  onContactSupport,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`billing-error-state ${className}`} role="alert">
      <div className="error-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h3 className="error-title">{title}</h3>
      {description && <p className="error-description">{description}</p>}
      {code && <code className="error-code">Error Code: {code}</code>}

      <div className="error-actions">
        {onRetry && (
          <button className="retry-btn" onClick={onRetry}>
            Try Again
          </button>
        )}
        {onContactSupport && (
          <button className="support-btn" onClick={onContactSupport}>
            Contact Support
          </button>
        )}
      </div>

      <style jsx>{`
        .billing-error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: ${BillingSpacing.xl} ${BillingSpacing.lg};
          background: ${BillingColors.dangerLight};
          border: 2px solid #fca5a5;
          border-radius: ${BillingRadius.lg};
          min-height: 200px;
        }

        .error-icon {
          color: ${BillingColors.danger};
          margin-bottom: ${BillingSpacing.md};
        }

        .error-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: ${BillingColors.dangerDark};
          margin: 0 0 ${BillingSpacing.sm};
        }

        .error-description {
          font-size: 0.875rem;
          color: ${BillingColors.danger};
          max-width: 500px;
          margin: 0 0 ${BillingSpacing.sm};
          line-height: 1.6;
        }

        .error-code {
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
          background: white;
          padding: 0.25rem 0.5rem;
          border-radius: ${BillingRadius.sm};
          margin-bottom: ${BillingSpacing.md};
        }

        .error-actions {
          display: flex;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
          justify-content: center;
        }

        .retry-btn,
        .support-btn {
          padding: 0.625rem 1.25rem;
          border-radius: ${BillingRadius.md};
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .retry-btn {
          background: ${BillingColors.danger};
          color: white;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .retry-btn:hover {
          background: #dc2626;
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
        }

        .support-btn {
          background: white;
          color: ${BillingColors.danger};
          border: 2px solid ${BillingColors.danger};
        }

        .support-btn:hover {
          background: ${BillingColors.dangerLight};
        }
      `}</style>
    </div>
  );
}
