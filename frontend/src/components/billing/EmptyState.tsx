/**
 * EmptyState Component
 * Displays a friendly empty state with icon, message, and optional CTA
 */

import React from 'react';
import { BillingColors, BillingRadius, BillingSpacing } from '@/design/billing.tokens';

export interface EmptyStateProps {
  /**
   * Icon to display (can be emoji, SVG element, or image)
   */
  icon?: React.ReactNode;
  /**
   * Main title/heading
   */
  title: string;
  /**
   * Description text
   */
  description?: string;
  /**
   * Optional action button
   */
  action?: {
    label: string;
    onClick: () => void;
  };
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`billing-empty-state ${className}`}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-description">{description}</p>}
      {action && (
        <button className="empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}

      <style jsx>{`
        .billing-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: ${BillingSpacing.xl} ${BillingSpacing.lg};
          min-height: 300px;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: ${BillingSpacing.md};
          opacity: 0.7;
        }

        .empty-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: ${BillingColors.textStrong};
          margin: 0 0 ${BillingSpacing.sm};
        }

        .empty-description {
          font-size: 0.875rem;
          color: ${BillingColors.textMuted};
          max-width: 400px;
          margin: 0 0 ${BillingSpacing.lg};
          line-height: 1.6;
        }

        .empty-action {
          padding: 0.625rem 1.25rem;
          background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
          color: white;
          border: none;
          border-radius: ${BillingRadius.md};
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 4px 12px rgba(249, 168, 212, 0.3);
        }

        .empty-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(249, 168, 212, 0.4);
        }

        .empty-action:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
