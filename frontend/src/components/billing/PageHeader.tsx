/**
 * PageHeader Component
 * Displays page title, subtitle, and breadcrumb navigation
 */

import React from 'react';
import Link from 'next/link';
import { BillingColors, BillingSpacing, BillingFonts } from '@/design/billing.tokens';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /**
   * Main page title
   */
  title: string;
  /**
   * Optional subtitle/description
   */
  subtitle?: string;
  /**
   * Breadcrumb navigation items
   */
  breadcrumb?: BreadcrumbItem[];
  /**
   * Optional action button (e.g., "Back to dashboard")
   */
  action?: React.ReactNode;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  breadcrumb,
  action,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="breadcrumb" aria-label="Breadcrumb">
          {breadcrumb.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="breadcrumb-separator">/</span>}
              {item.href ? (
                <Link href={item.href} className="breadcrumb-link">
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumb-current">{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="header-main">
        <div className="header-text">
          <h1 className="header-title">{title}</h1>
          {subtitle && <p className="header-subtitle">{subtitle}</p>}
        </div>
        {action && <div className="header-action">{action}</div>}
      </div>

      <style jsx>{`
        .page-header {
          margin-bottom: ${BillingSpacing.xl};
        }

        /* Breadcrumb */
        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: ${BillingSpacing.md};
          font-size: 0.875rem;
          flex-wrap: wrap;
        }

        .breadcrumb-link {
          color: ${BillingColors.textAccent};
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .breadcrumb-link:hover {
          color: #7c3aed;
          text-decoration: underline;
        }

        .breadcrumb-separator {
          color: ${BillingColors.textMuted};
          user-select: none;
        }

        .breadcrumb-current {
          color: ${BillingColors.textMuted};
        }

        /* Header Main */
        .header-main {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: ${BillingSpacing.lg};
          flex-wrap: wrap;
        }

        .header-text {
          flex: 1;
          min-width: 0;
        }

        .header-title {
          font-family: ${BillingFonts.display};
          font-size: 2rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          margin: 0;
          line-height: 1.2;
        }

        .header-subtitle {
          font-size: 1rem;
          color: ${BillingColors.textAccent};
          margin: ${BillingSpacing.sm} 0 0;
          line-height: 1.5;
        }

        .header-action {
          flex-shrink: 0;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .header-title {
            font-size: 1.5rem;
          }

          .header-subtitle {
            font-size: 0.875rem;
          }

          .header-main {
            flex-direction: column;
            align-items: stretch;
          }

          .header-action {
            align-self: flex-start;
          }
        }
      `}</style>
    </header>
  );
}
