/**
 * BillingLayout Component
 * Provides consistent layout wrapper for billing pages
 */

import React from 'react';
import { BillingGradients, BillingSpacing } from '@/design/billing.tokens';
import PageHeader, { BreadcrumbItem } from './PageHeader';

export interface BillingLayoutProps {
  /**
   * Page title
   */
  title: string;
  /**
   * Optional subtitle
   */
  subtitle?: string;
  /**
   * Breadcrumb items
   */
  breadcrumb?: BreadcrumbItem[];
  /**
   * Optional header action (e.g., button)
   */
  headerAction?: React.ReactNode;
  /**
   * Page content
   */
  children: React.ReactNode;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function BillingLayout({
  title,
  subtitle,
  breadcrumb,
  headerAction,
  children,
  className = '',
}: BillingLayoutProps) {
  return (
    <div className={`billing-layout ${className}`}>
      <div className="billing-container">
        <PageHeader
          title={title}
          subtitle={subtitle}
          breadcrumb={breadcrumb}
          action={headerAction}
        />

        <div className="billing-content">{children}</div>
      </div>

      <style jsx>{`
        .billing-layout {
          min-height: 100vh;
          background: ${BillingGradients.warm};
          padding: ${BillingSpacing.lg};
        }

        .billing-container {
          max-width: 1280px;
          margin: 0 auto;
        }

        .billing-content {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.lg};
        }

        @media (max-width: 768px) {
          .billing-layout {
            padding: ${BillingSpacing.md};
          }
        }

        @media (max-width: 640px) {
          .billing-layout {
            padding: ${BillingSpacing.sm};
          }
        }
      `}</style>
    </div>
  );
}
