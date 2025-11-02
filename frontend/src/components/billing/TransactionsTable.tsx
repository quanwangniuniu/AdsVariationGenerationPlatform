/**
 * TransactionsTable Component
 * Displays transaction history with pagination, sorting, and filtering
 */

import React from 'react';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingShadows,
  BillingSpacing,
} from '@/design/billing.tokens';
import { Transaction, formatCurrency, formatDateTime, BillingAPIError } from '@/api/billing';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import SkeletonTable from './SkeletonTable';

export interface TransactionsTableProps {
  /**
   * Transaction data
   */
  data?: Transaction[];
  /**
   * Loading state
   */
  isLoading?: boolean;
  /**
   * Error state
   */
  error?: Error | null;
  /**
   * Pagination config
   */
  pagination: {
    page: number;
    pageSize: number;
    total?: number;
  };
  /**
   * Page change handler
   */
  onPageChange: (page: number) => void;
  /**
   * Sort change handler
   */
  onSortChange?: (field: string) => void;
  /**
   * Optional CSS class
   */
  className?: string;
  /**
   * Whether to display the transaction initiator column.
   */
  showInitiator?: boolean;
}

export default function TransactionsTable({
  data = [],
  isLoading = false,
  error = null,
  pagination,
  onPageChange,
  onSortChange: _onSortChange,
  className = '',
  showInitiator = false,
}: TransactionsTableProps) {
  const columnCount = showInitiator ? 6 : 5;

  // Loading state
  if (isLoading) {
    return <SkeletonTable rows={pagination.pageSize} columns={columnCount} />;
  }

  // Error state
  if (error) {
    const apiError = error instanceof BillingAPIError ? error : null;
    const description = apiError?.message || error.message || 'Unable to load transactions.';
    const code = apiError?.code || (apiError ? `HTTP_${apiError.status}` : undefined);
    return (
      <ErrorState
        title="Failed to load transactions"
        description={description}
        code={code}
        onRetry={() => onPageChange(pagination.page)}
      />
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <EmptyState
        icon="📭"
        title="No transactions yet"
        description="Your billing activity will appear here once you make purchases or receive credits."
      />
    );
  }

  const totalPages = pagination.total
    ? Math.ceil(pagination.total / pagination.pageSize)
    : 1;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'posted':
        return BillingColors.success;
      case 'pending':
        return BillingColors.warning;
      case 'void':
        return BillingColors.danger;
      default:
        return BillingColors.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'posted':
        return 'Posted';
      case 'pending':
        return 'Pending';
      case 'void':
        return 'Void';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      token_purchase: 'Token Purchase',
      token_consume: 'Token Consumption',
      subscription_invoice: 'Subscription Invoice',
      credit_adjustment: 'Credit Adjustment',
      payment: 'Payment',
      refund: 'Refund',
      manual: 'Manual Adjustment',
    };
    return labels[category] || category.replace(/_/g, ' ');
  };

  return (
    <div className={`transactions-table-wrapper ${className}`}>
      <div className="table-container">
        <table className="transactions-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Category</th>
              {showInitiator && <th scope="col">Initiated By</th>}
              <th scope="col">Description</th>
              <th scope="col" className="text-right">Amount</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((transaction) => (
              <tr key={transaction.id}>
                <td className="date-cell">
                  {formatDateTime(transaction.occurred_at)}
                </td>
                <td>
                  <span className="category-badge">
                    {getCategoryLabel(transaction.category)}
                  </span>
                </td>
                {showInitiator && (
                  <td className="initiator-cell">
                    {transaction.initiator?.username ||
                      transaction.initiator?.email ||
                      '—'}
                  </td>
                )}
                <td className="description-cell">
                  {transaction.description || '—'}
                </td>
                <td className="amount-cell text-right">
                  <span
                    className={`amount ${
                      transaction.direction === 'credit' ? 'credit' : 'debit'
                    }`}
                  >
                    {transaction.direction === 'credit' ? '+' : '-'}
                    {formatCurrency(transaction.amount, transaction.currency)}
                  </span>
                </td>
                <td>
                  <span
                    className="status-badge"
                    style={{ color: getStatusColor(transaction.status) }}
                  >
                    {getStatusLabel(transaction.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
            aria-label="Previous page"
          >
            Previous
          </button>

          <span className="pagination-info">
            Page {pagination.page} of {totalPages}
          </span>

          <button
            className="pagination-btn"
            onClick={() => onPageChange(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}

      <style jsx>{`
        .transactions-table-wrapper {
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.xl};
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${BillingColors.borderLight};
          overflow: hidden;
        }

        .table-container {
          overflow-x: auto;
          background: rgba(255, 255, 255, 0.92);
        }

        .transactions-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }

        thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          text-align: left;
          font-size: 0.8125rem;
          letter-spacing: 0.05em;
          font-weight: 700;
          color: ${BillingColors.textMuted};
          padding: ${BillingSpacing.md} ${BillingSpacing.md};
          background: linear-gradient(135deg, rgba(249, 245, 255, 0.92), rgba(255, 247, 242, 0.92));
          backdrop-filter: blur(12px);
          text-transform: uppercase;
        }

        tbody td {
          padding: ${BillingSpacing.md};
          font-size: 0.9375rem;
          color: ${BillingColors.textMedium};
          border-top: 1px solid ${BillingColors.borderLight};
          vertical-align: top;
        }

        tbody tr:nth-child(even) {
          background: rgba(249, 245, 255, 0.35);
        }

        tbody tr:hover {
          background: rgba(255, 184, 107, 0.12);
        }

        .text-right {
          text-align: right;
        }

        .date-cell {
          white-space: nowrap;
        }

        .initiator-cell {
          min-width: 140px;
          color: ${BillingColors.textStrong};
        }

        .description-cell {
          max-width: 320px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .amount-cell .amount {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }

        .amount.credit {
          color: ${BillingColors.success};
        }

        .amount.debit {
          color: ${BillingColors.danger};
        }

        .category-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.35rem 0.75rem;
          border-radius: ${BillingRadius.full};
          background: rgba(139, 92, 246, 0.12);
          color: ${BillingColors.textAccent};
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          font-weight: 600;
          font-size: 0.82rem;
          text-transform: capitalize;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: ${BillingSpacing.md};
          background: rgba(255, 255, 255, 0.9);
          border-top: 1px solid ${BillingColors.borderLight};
        }

        .pagination-btn {
          padding: 0.5rem 1rem;
          border-radius: ${BillingRadius.md};
          border: 1px solid ${BillingColors.borderMedium};
          background: white;
          color: ${BillingColors.textAccent};
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .pagination-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .pagination-info {
          font-size: 0.875rem;
          color: ${BillingColors.textMuted};
        }
      `}</style>
    </div>
  );
}
