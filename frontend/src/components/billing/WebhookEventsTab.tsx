'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  workspaceWebhookEventsQuery,
  WebhookEvent,
  formatDateTime,
  BillingAPIError,
} from '@/api/billing';
import {
  BillingColors,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';
import SkeletonTable from './SkeletonTable';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import BillingToast from './BillingToast';
import BillingFilterBar from './BillingFilterBar';
import { useBillingQueryParams } from '@/hooks/useBillingQueryParams';
import { useBillingToast } from '@/hooks/useBillingToast';
import { useBillingDateRange } from '@/hooks/useBillingDateRange';

export interface WebhookEventsTabProps {
  workspaceId: string;
  className?: string;
}

export default function WebhookEventsTab({ workspaceId, className = '' }: WebhookEventsTabProps) {
  const { page, setPage } = useBillingQueryParams({ pageKey: 'webhooksPage' });
  const { ordering: status, setOrdering: setStatus } = useBillingQueryParams({
    pageKey: 'webhooksPage',
    orderingKey: 'webhookStatus',
    defaultOrdering: '',
  });
  const { ordering: eventFilter, setOrdering: setEventFilter } = useBillingQueryParams({
    pageKey: 'webhooksPage',
    orderingKey: 'webhookEvent',
    defaultOrdering: '',
  });
  const {
    startValue: startDate,
    endValue: endDate,
    setStartValue: setStartDate,
    setEndValue: setEndDate,
  } = useBillingDateRange({ startKey: 'webhookStart', endKey: 'webhookEnd' });
  const { toast, pushToast, dismissToast } = useBillingToast();

  const {
    data: eventsData,
    isLoading,
    error,
  } = useQuery(
    workspaceWebhookEventsQuery(workspaceId, {
      page,
      status: status || undefined,
      event_type: eventFilter || undefined,
      created_after: startDate || undefined,
      created_before: endDate || undefined,
    })
  );

const eventResults = useMemo(() => eventsData?.results ?? [], [eventsData?.results]);

const eventTypeOptions = useMemo(() => {
  const types = new Set<string>();
  eventResults.forEach((event) => {
    if (event.event_type) types.add(event.event_type);
  });
  return Array.from(types)
    .sort()
    .map((value) => ({ label: value.replace(/\./g, ' '), value }));
}, [eventResults]);

const pageSize = eventResults.length;
const totalPages = eventsData && pageSize > 0 ? Math.ceil(eventsData.count / pageSize) : 1;

const statusTone = (status: string) => {
  switch (status) {
    case 'processed':
      return BillingColors.success;
    case 'received':
    case 'processing':
      return BillingColors.warning;
    case 'ignored':
      return BillingColors.textMuted;
    case 'failed':
      return BillingColors.danger;
    default:
      return BillingColors.textMuted;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'received':
      return 'Received';
    case 'processing':
      return 'Processing';
    case 'processed':
      return 'Processed';
    case 'ignored':
      return 'Ignored';
    case 'failed':
      return 'Failed';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

  return (
    <div className={`webhook-card ${className}`}>
      {toast && (
        <div className="toast-wrapper">
          <BillingToast tone={toast.tone} message={toast.message} onDismiss={dismissToast} />
        </div>
      )}
      <BillingFilterBar
        context="webhook"
        status={{
          label: 'Status',
          value: status,
          options: [
            { label: 'Received', value: 'received' },
            { label: 'Processing', value: 'processing' },
            { label: 'Processed', value: 'processed' },
            { label: 'Ignored', value: 'ignored' },
            { label: 'Failed', value: 'failed' },
          ],
          onChange: (value) => {
            setPage(1);
            setStatus(value ?? '');
          },
        }}
        category={{
          label: 'Event',
          value: eventFilter,
          options: eventTypeOptions,
          onChange: (value) => {
            setPage(1);
            setEventFilter(value ?? '');
          },
        }}
        dateRange={{
          startLabel: 'Received From',
          endLabel: 'Received To',
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
          <SkeletonTable rows={5} columns={5} />
        ) : error ? (
          <ErrorState
            title="Failed to load webhook events"
            description={
              error instanceof BillingAPIError
                ? error.message
                : (error as any).message || 'Unable to load webhook events.'
            }
            code={
              error instanceof BillingAPIError
                ? error.code || `HTTP_${error.status}`
                : undefined
            }
            onRetry={() => setPage(page)}
          />
        ) : !eventsData || eventResults.length === 0 ? (
          <EmptyState
            icon="📬"
            title="No webhook events yet"
            description="Stripe webhook activity will appear here once events are received."
          />
        ) : (
          <table className="webhook-table">
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Event Type</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last Attempt</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {eventResults.map((event: WebhookEvent) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.created_at)}</td>
                  <td className="event-type">{event.event_type}</td>
                <td>
                  <span className="status-chip" style={{ color: statusTone(event.status) }}>
                    {statusLabel(event.status)}
                  </span>
                </td>
                  <td className="attempts">{event.attempts}</td>
                  <td>{event.last_attempt_at ? formatDateTime(event.last_attempt_at) : '—'}</td>
                  <td className="details-cell">
                    {event.error_message ? (
                      <span className="error-text">{event.error_message}</span>
                    ) : (
                      <span className="success-text">Processed successfully</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
        .webhook-card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          border: 1px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .toast-wrapper {
          max-width: 520px;
        }

        .table-wrap {
          overflow-x: auto;
        }

        .webhook-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 720px;
          font-size: 0.9rem;
        }

        thead th {
          text-align: left;
          padding: 0.75rem 1rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 0.75rem;
          color: ${BillingColors.textMuted};
          border-bottom: 2px solid ${BillingColors.borderLight};
          background: rgba(249, 245, 255, 0.6);
        }

        tbody td {
          padding: 0.85rem 1rem;
          border-bottom: 1px solid ${BillingColors.borderLight};
          color: ${BillingColors.textMedium};
          vertical-align: top;
        }

        tbody tr:hover {
          background: rgba(249, 245, 255, 0.35);
        }

        .event-type {
          font-weight: 600;
          color: ${BillingColors.textStrong};
        }

        .attempts {
          font-variant-numeric: tabular-nums;
        }

        .details-cell {
          max-width: 240px;
          white-space: pre-wrap;
          word-break: break-word;
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

        .error-text {
          color: ${BillingColors.danger};
          font-weight: 600;
        }

        .success-text {
          color: ${BillingColors.textMuted};
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
          .webhook-card {
            padding: ${BillingSpacing.md};
          }

          .webhook-table {
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
