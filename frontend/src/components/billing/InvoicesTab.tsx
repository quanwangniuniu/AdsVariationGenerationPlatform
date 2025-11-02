/**
 * Invoices Tab Component
 * Displays workspace invoice list with download capability
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  workspaceInvoicesQuery,
  userInvoicesQuery,
  downloadInvoicePDF,
  Invoice,
  formatCurrency,
  formatDate,
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

export interface InvoicesTabProps {
  workspaceId?: string;
  scope?: 'workspace' | 'user';
  className?: string;
}

export default function InvoicesTab({
  workspaceId,
  scope = 'workspace',
  className = '',
}: InvoicesTabProps) {
  const { page, setPage } = useBillingQueryParams({ pageKey: 'invoicesPage' });
  const { ordering: status, setOrdering: setStatus } = useBillingQueryParams({
    pageKey: 'invoicesPage',
    orderingKey: 'invoiceStatus',
    defaultOrdering: '',
  });
  const {
    startValue: startDate,
    endValue: endDate,
    setStartValue: setStartDate,
    setEndValue: setEndDate,
  } = useBillingDateRange({ startKey: 'invoiceStart', endKey: 'invoiceEnd' });
  const { toast, pushToast, dismissToast } = useBillingToast();

  const isWorkspaceScope = scope === 'workspace' && Boolean(workspaceId);
  const invoicesQueryOptions = isWorkspaceScope
    ? workspaceInvoicesQuery(workspaceId as string, {
        page,
        status: status || undefined,
        issued_after: startDate || undefined,
        issued_before: endDate || undefined,
      })
    : userInvoicesQuery({
        page,
        status: status || undefined,
        issued_after: startDate || undefined,
        issued_before: endDate || undefined,
      });

  const { data: invoicesData, isLoading, error } = useQuery(invoicesQueryOptions);

  const invoiceResults = invoicesData?.results ?? [];
  const hasInvoices = invoiceResults.length > 0;
  const pageSize = invoiceResults.length;
  const totalPages =
    invoicesData && hasInvoices ? Math.ceil(invoicesData.count / pageSize) : 1;

  const handleDownload = async (invoice: Invoice) => {
    try {
      const blobUrl = await downloadInvoicePDF(invoice.id, isWorkspaceScope ? { workspaceId } : undefined);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `invoice-${invoice.metadata?.number || invoice.stripe_invoice_id}.pdf`;
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

  const statusTone = (status: string) => {
    switch (status) {
      case 'paid':
        return BillingColors.success;
      case 'open':
        return BillingColors.warning;
      case 'void':
      case 'uncollectible':
        return BillingColors.danger;
      default:
        return BillingColors.textMuted;
    }
  };

  return (
    <div className={`invoices-card ${className}`}>
      {toast && (
        <div className="toast-wrapper">
          <BillingToast tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
        </div>
      )}
      <BillingFilterBar
        context="invoice"
        status={{
          label: 'Status',
          value: status,
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Open', value: 'open' },
            { label: 'Paid', value: 'paid' },
            { label: 'Void', value: 'void' },
            { label: 'Uncollectible', value: 'uncollectible' },
          ],
          onChange: (value) => {
            setPage(1);
            setStatus(value ?? '');
          },
        }}
        dateRange={{
          startLabel: 'Issued From',
          endLabel: 'Issued To',
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
        {isLoading ? (
          <SkeletonTable rows={5} columns={6} />
        ) : error ? (
          <ErrorState
            title="Failed to load invoices"
            description={
              error instanceof BillingAPIError
                ? error.message
                : (error as any).message || 'Unable to load invoices.'
            }
            code={
              error instanceof BillingAPIError
                ? error.code || `HTTP_${error.status}`
                : undefined
            }
            onRetry={() => setPage(page)}
          />
        ) : !hasInvoices ? (
          <EmptyState
            icon="📄"
            title="No invoices yet"
            description="Workspace invoices will appear here once billing activity occurs."
          />
        ) : (
          <table className="invoices-table">
            <thead>
              <tr>
                <th scope="col">Issued</th>
                <th scope="col">Invoice</th>
                <th scope="col">Initiated By</th>
                <th scope="col" className="text-right">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoiceResults.map((invoice: Invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.issued_at ? formatDate(invoice.issued_at) : '—'}</td>
                  <td className="invoice-id">
                    {invoice.metadata?.number || invoice.stripe_invoice_id}
                    {invoice.due_at && (
                      <>
                        <br />
                        <span className="due-date">Due {formatDate(invoice.due_at)}</span>
                      </>
                    )}
                  </td>
                  <td className="initiator">
                    {invoice.initiator?.username ||
                      invoice.initiator?.email ||
                      '—'}
                  </td>
                  <td className="text-right amount">
                    {formatCurrency(invoice.total_amount, invoice.currency)}
                  </td>
                  <td>
                    <span
                      className="status-chip"
                      style={{ color: statusTone(invoice.status) }}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td>
                    <GradientButton
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownload(invoice)}
                      data-testid={`download-invoice-${invoice.id}`}
                    >
                      Download PDF
                    </GradientButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && !isLoading && !error && hasInvoices && (
        <div className="pagination">
          <button
            onClick={() => setPage(Math.max(page - 1, 1))}
            disabled={page === 1}
          >
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
        .invoices-card {
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

        .invoices-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          min-width: 760px;
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

        .invoice-id {
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .due-date {
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
        }

        .initiator {
          min-width: 160px;
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
          background: rgba(139, 92, 246, 0.1);
          text-transform: capitalize;
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: ${BillingSpacing.md};
          padding-top: ${BillingSpacing.md};
          border-top: 1px solid ${BillingColors.borderLight};
          color: ${BillingColors.textMuted};
          font-size: 0.85rem;
          background: rgba(255, 255, 255, 0.85);
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
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
          .invoices-card {
            padding: ${BillingSpacing.md};
          }

          .invoices-table {
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
