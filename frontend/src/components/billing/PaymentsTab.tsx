import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  workspacePaymentsQuery,
  userPaymentsQuery,
  downloadInvoicePDF,
  Payment,
  formatCurrency,
  formatDateTime,
  BillingAPIError,
} from '@/api/billing';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import SkeletonTable from './SkeletonTable';
import GradientButton from './GradientButton';
import BillingToast from './BillingToast';
import BillingFilterBar from './BillingFilterBar';
import { useBillingQueryParams } from '@/hooks/useBillingQueryParams';
import { useBillingToast } from '@/hooks/useBillingToast';
import { useBillingDateRange } from '@/hooks/useBillingDateRange';

export interface PaymentsTabProps {
  workspaceId?: string;
  scope?: 'workspace' | 'user';
  className?: string;
}

export default function PaymentsTab({
  workspaceId,
  scope = 'workspace',
  className = '',
}: PaymentsTabProps) {
  const { page, setPage } = useBillingQueryParams({ pageKey: 'paymentsPage' });
  const { ordering: status, setOrdering: setStatus } = useBillingQueryParams({
    pageKey: 'paymentsPage',
    orderingKey: 'paymentStatus',
    defaultOrdering: '',
  });
  const {
    startValue: startDate,
    endValue: endDate,
    setStartValue: setStartDate,
    setEndValue: setEndDate,
  } = useBillingDateRange({ startKey: 'paymentStart', endKey: 'paymentEnd' });
  const { toast, pushToast, dismissToast } = useBillingToast();

  const isWorkspaceScope = scope === 'workspace' && Boolean(workspaceId);
  const paymentsQueryOptions = isWorkspaceScope
    ? workspacePaymentsQuery(workspaceId as string, {
        page,
        status: status || undefined,
        created_after: startDate || undefined,
        created_before: endDate || undefined,
      })
    : userPaymentsQuery({
        page,
        status: status || undefined,
        created_after: startDate || undefined,
        created_before: endDate || undefined,
      });

  const { data: paymentsData, isLoading, error } = useQuery(paymentsQueryOptions);

  const pageSize = paymentsData?.results.length ?? 0;
  const totalPages =
    paymentsData && pageSize > 0 ? Math.ceil(paymentsData.count / pageSize) : 1;

  const handleDownloadInvoice = async (payment: Payment) => {
    if (!payment.invoice) return;
    try {
      const blobUrl = await downloadInvoicePDF(
        payment.invoice.id,
        isWorkspaceScope ? { workspaceId } : undefined,
      );
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `invoice-${payment.invoice.metadata?.number || payment.invoice.stripe_invoice_id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      pushToast({ tone: 'success', message: 'Invoice download started.' });
    } catch (err: any) {
      pushToast({
        tone: 'error',
        message: err?.message || 'Failed to download invoice',
      });
    }
  };

  if (isLoading) {
    return <SkeletonTable rows={5} columns={6} />;
  }

  if (error) {
    const apiError = error instanceof BillingAPIError ? error : null;
    return (
      <ErrorState
        title="Failed to load payments"
        description={apiError?.message || (error as any).message || 'Unable to load payments.'}
        code={apiError?.code || (apiError ? `HTTP_${apiError.status}` : undefined)}
        onRetry={() => setPage(page)}
      />
    );
  }

  if (!paymentsData || paymentsData.results.length === 0) {
    return (
      <EmptyState
        icon="💳"
        title="No payments yet"
        description="Workspace payment history will appear once invoices are settled."
      />
    );
  }

  const statusTone = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'refunded':
        return BillingColors.success;
      case 'failed':
      case 'canceled':
        return BillingColors.danger;
      case 'requires_action':
      case 'requires_payment_method':
        return BillingColors.warning;
      default:
        return BillingColors.textMuted;
    }
  };

  return (
    <div className={`payments-card ${className}`}>
      {toast && (
        <div className="toast-wrapper">
          <BillingToast tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
        </div>
      )}
      <BillingFilterBar
        context="payment"
        status={{
          label: 'Status',
          value: status,
          options: [
            { label: 'Succeeded', value: 'succeeded' },
            { label: 'Processing', value: 'processing' },
            { label: 'Requires Action', value: 'requires_action' },
            { label: 'Requires Payment Method', value: 'requires_payment_method' },
            { label: 'Failed', value: 'failed' },
            { label: 'Canceled', value: 'canceled' },
            { label: 'Refunded', value: 'refunded' },
          ],
          onChange: (value) => {
            setPage(1);
            setStatus(value ?? '');
          },
        }}
        dateRange={{
          startLabel: 'Processed From',
          endLabel: 'Processed To',
          startValue: startDate,
          endValue: endDate,
          onStartChange: (value) => {
            setPage(1);
            setStartDate(value);
          },
          onEndChange: (value) => {
            setPage(1);
            setEndDate(value);
          },
        }}
      />
      <div className="table-wrap">
        <table className="payments-table">
          <thead>
            <tr>
              <th scope="col">Processed</th>
              <th scope="col">Initiated By</th>
              <th scope="col">Invoice</th>
              <th scope="col" className="text-right">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paymentsData.results.map((payment: Payment) => (
              <tr key={payment.id}>
                <td>{formatDateTime(payment.created_at)}</td>
                <td className="initiator">
                  {payment.initiator?.username || payment.initiator?.email || '—'}
                </td>
                <td className="invoice-cell">
                  {payment.invoice ? (
                    <>
                      <span className="invoice-id">
                        {payment.invoice.metadata?.number || payment.invoice.stripe_invoice_id}
                      </span>
                      {payment.invoice.status && (
                        <span className="invoice-status">{payment.invoice.status}</span>
                      )}
                    </>
                  ) : (
                    <span className="invoice-status">No invoice linked</span>
                  )}
                </td>
                <td className="text-right amount">
                  {formatCurrency(payment.amount, payment.currency)}
                </td>
                <td>
                  <span className="status-chip" style={{ color: statusTone(payment.status) }}>
                    {payment.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    {payment.invoice && (
                      <GradientButton
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownloadInvoice(payment)}
                      >
                        Invoice PDF
                      </GradientButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(Math.max(page - 1, 1))} disabled={page === 1}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(page + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}

      <style jsx>{`
        .payments-card {
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.xl};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          padding: ${BillingSpacing.lg};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .toast-wrapper {
          max-width: 520px;
        }

        .table-wrap {
          overflow-x: auto;
          background: rgba(255, 255, 255, 0.92);
          border-radius: ${BillingRadius.lg};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }

        .payments-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
          font-size: 0.9rem;
        }

        thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          text-align: left;
          padding: 0.75rem 1rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
          border-bottom: 2px solid ${BillingColors.borderLight};
          background: linear-gradient(135deg, rgba(249, 245, 255, 0.92), rgba(255, 247, 242, 0.92));
          backdrop-filter: blur(12px);
        }

        tbody td {
          padding: 0.85rem 1rem;
          border-bottom: 1px solid ${BillingColors.borderLight};
          color: ${BillingColors.textMedium};
          vertical-align: top;
        }

        tbody tr:nth-child(even) {
          background: rgba(249, 245, 255, 0.35);
        }

        tbody tr:hover {
          background: rgba(255, 184, 107, 0.12);
        }

        .initiator {
          min-width: 150px;
        }

        .invoice-cell {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .invoice-id {
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .invoice-status {
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
        }

        .amount {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }

        .status-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.6rem;
          border-radius: ${BillingRadius.sm};
          font-size: 0.75rem;
          text-transform: capitalize;
          background: rgba(139, 92, 246, 0.1);
        }

        .actions {
          display: flex;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: ${BillingSpacing.md};
          padding: ${BillingSpacing.md};
          border-top: 1px solid ${BillingColors.borderLight};
          color: ${BillingColors.textMuted};
          font-size: 0.85rem;
          background: rgba(255, 255, 255, 0.85);
          border-radius: ${BillingRadius.lg};
        }

        .pagination button {
          border: 1px solid ${BillingColors.borderMedium};
          background: white;
          color: ${BillingColors.textAccent};
          font-weight: 600;
          border-radius: ${BillingRadius.md};
          padding: 0.45rem 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pagination button:hover:not(:disabled) {
          background: rgba(249, 168, 212, 0.1);
          box-shadow: ${BillingShadows.card};
        }

        .pagination button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .payments-card {
            padding: ${BillingSpacing.md};
          }

          .payments-table {
            min-width: 100%;
            font-size: 0.825rem;
          }

          thead th,
          tbody td {
            padding: 0.65rem 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
