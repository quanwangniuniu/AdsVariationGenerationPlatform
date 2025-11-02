/**
 * SkeletonTable Component
 * Loading placeholder for tables
 */

import React from 'react';
import { BillingColors, BillingRadius } from '@/design/billing.tokens';

export interface SkeletonTableProps {
  /**
   * Number of rows to display
   */
  rows?: number;
  /**
   * Number of columns
   */
  columns?: number;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function SkeletonTable({
  rows = 5,
  columns = 5,
  className = '',
}: SkeletonTableProps) {
  return (
    <div className={`skeleton-table ${className}`}>
      <div className="skeleton-header">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="skeleton-cell skeleton-shimmer" />
        ))}
      </div>

      <div className="skeleton-body">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="skeleton-row">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <div key={colIdx} className="skeleton-cell skeleton-shimmer" />
            ))}
          </div>
        ))}
      </div>

      <style jsx>{`
        .skeleton-table {
          border-radius: ${BillingRadius.lg};
          overflow: hidden;
          border: 2px solid ${BillingColors.borderLight};
          background: white;
        }

        .skeleton-header {
          display: grid;
          grid-template-columns: repeat(${columns}, 1fr);
          gap: 1rem;
          padding: 1rem;
          background: #fafafa;
          border-bottom: 2px solid ${BillingColors.borderLight};
        }

        .skeleton-body {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .skeleton-row {
          display: grid;
          grid-template-columns: repeat(${columns}, 1fr);
          gap: 1rem;
        }

        .skeleton-cell {
          height: 1.25rem;
          background: #e5e7eb;
          border-radius: ${BillingRadius.sm};
        }

        .skeleton-shimmer {
          position: relative;
          overflow: hidden;
        }

        .skeleton-shimmer::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.6),
            transparent
          );
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          to {
            left: 100%;
          }
        }

        @media (max-width: 768px) {
          .skeleton-header,
          .skeleton-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
