import React from 'react';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
} from '@/design/billing.tokens';

export interface BillingFilterOption {
  label: string;
  value: string;
}

export interface BillingFilterBarProps {
  /**
   * Context prefix for data-testid attributes (e.g., 'invoice', 'payment', 'workspace-transaction')
   */
  context?: string;
  status?: {
    label: string;
    value: string | undefined;
    options: BillingFilterOption[];
    onChange: (value: string | undefined) => void;
  };
  category?: {
    label: string;
    value: string | undefined;
    options: BillingFilterOption[];
    onChange: (value: string | undefined) => void;
  };
  dateRange?: {
    startLabel?: string;
    endLabel?: string;
    startValue?: string;
    endValue?: string;
    onStartChange: (value: string | undefined) => void;
    onEndChange: (value: string | undefined) => void;
  };
  extra?: React.ReactNode;
}

export default function BillingFilterBar({ context, status, category, dateRange, extra }: BillingFilterBarProps) {
  const hasFilters = Boolean(status || category || dateRange || extra);
  if (!hasFilters) return null;

  return (
    <div className="filter-bar">
      <div className="filter-grid">
        {status && (
          <FilterSelect
            context={context}
            label={status.label}
            value={status.value}
            options={status.options}
            onChange={status.onChange}
          />
        )}
        {category && (
          <FilterSelect
            context={context}
            label={category.label}
            value={category.value}
            options={category.options}
            onChange={category.onChange}
          />
        )}
        {dateRange && (
          <DateRangeGroup
            startLabel={dateRange.startLabel}
            endLabel={dateRange.endLabel}
            startValue={dateRange.startValue}
            endValue={dateRange.endValue}
            onStartChange={dateRange.onStartChange}
            onEndChange={dateRange.onEndChange}
          />
        )}
      </div>
      {extra && <div className="filter-extra">{extra}</div>}

      <style jsx>{`
        .filter-bar {
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.md};
          display: flex;
          flex-wrap: wrap;
          gap: ${BillingSpacing.md};
          align-items: center;
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${BillingColors.borderLight};
        }

        .filter-grid {
          display: flex;
          gap: ${BillingSpacing.md};
          flex-wrap: wrap;
          flex: 1;
        }

        .filter-extra {
          margin-left: auto;
        }

        @media (max-width: 640px) {
          .filter-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-extra {
            margin-left: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

interface FilterSelectProps {
  context?: string;
  label: string;
  value: string | undefined;
  options: BillingFilterOption[];
  onChange: (value: string | undefined) => void;
}

function FilterSelect({ context, label, value, options, onChange }: FilterSelectProps) {
  // Generate testid: if context provided, use "context-label-filter", otherwise "label-filter"
  const labelSlug = label.toLowerCase().replace(/\s+/g, '-');
  const testId = context ? `${context}-${labelSlug}-filter` : `${labelSlug}-filter`;
  return (
    <label className="filter-select">
      <span className="filter-label">{label}</span>
      <select
        className="filter-control"
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === '' ? undefined : next);
        }}
        data-testid={testId}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <style jsx>{`
        .filter-select {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
          min-width: 180px;
        }

        .filter-label {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: ${BillingColors.textMuted};
        }

        .filter-control {
          appearance: none;
          background: rgba(255, 255, 255, 0.9);
          border-radius: ${BillingRadius.md};
          border: 1px solid ${BillingColors.borderMedium};
          padding: 0.55rem 0.85rem;
          font-size: 0.95rem;
          color: ${BillingColors.textMedium};
          box-shadow: 0 6px 16px rgba(255, 184, 107, 0.15);
          transition: border 0.2s ease, box-shadow 0.2s ease;
        }

        .filter-control:hover {
          border-color: ${BillingColors.borderStrong};
          box-shadow: 0 10px 24px rgba(255, 138, 171, 0.18);
        }

        .filter-control:focus {
          outline: none;
          border-color: ${BillingColors.borderStrong};
        }

        @media (max-width: 640px) {
          .filter-select {
            width: 100%;
          }
        }
      `}</style>
    </label>
  );
}

interface DateRangeGroupProps {
  startLabel?: string;
  endLabel?: string;
  startValue?: string;
  endValue?: string;
  onStartChange: (value: string | undefined) => void;
  onEndChange: (value: string | undefined) => void;
}

function DateRangeGroup({
  startLabel = 'Start Date',
  endLabel = 'End Date',
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: DateRangeGroupProps) {
  return (
    <>
      <div className="date-group">
        <label className="filter-select">
          <span className="filter-label">{startLabel}</span>
          <input
            type="date"
            className="filter-control"
            value={startValue ?? ''}
            onChange={(event) => {
              const next = event.target.value;
              onStartChange(next === '' ? undefined : next);
            }}
          />
        </label>
        <span className="tilde">~</span>
        <label className="filter-select">
          <span className="filter-label">{endLabel}</span>
          <input
            type="date"
            className="filter-control"
            value={endValue ?? ''}
            onChange={(event) => {
              const next = event.target.value;
              onEndChange(next === '' ? undefined : next);
            }}
          />
        </label>
      </div>

      <style jsx>{`
        .date-group {
          display: flex;
          align-items: flex-end;
          gap: ${BillingSpacing.sm};
          flex-wrap: wrap;
        }

        .tilde {
          font-size: 1.25rem;
          font-weight: 600;
          color: ${BillingColors.textMuted};
          padding-bottom: 0.4rem;
        }

        @media (max-width: 640px) {
          .date-group {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
          }

          .tilde {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
