/**
 * SegmentedTabs Component
 * Pill-style segmented control for navigation tabs
 */

import React from 'react';
import { BillingColors, BillingRadius, BillingSpacing } from '@/design/billing.tokens';

export interface TabOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedTabsProps {
  /**
   * Tab options
   */
  options: TabOption[];
  /**
   * Currently selected value
   */
  value: string;
  /**
   * Change handler
   */
  onChange: (value: string) => void;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function SegmentedTabs({
  options,
  value,
  onChange,
  className = '',
}: SegmentedTabsProps) {
  return (
    <div className={`segmented-tabs ${className}`} role="tablist">
      {options.map((option) => {
        const isActive = value === option.value;
        const isDisabled = option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(option.value)}
            className={`tab-button ${isActive ? 'active' : ''} ${
              isDisabled ? 'disabled' : ''
            }`}
            data-testid={`billing-tab-${option.value}`}
          >
            {option.label}
          </button>
        );
      })}

      <style jsx>{`
        .segmented-tabs {
          display: inline-flex;
          background: #f9f5ff;
          border-radius: ${BillingRadius.xl};
          padding: 0.25rem;
          gap: 0.25rem;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .tab-button {
          position: relative;
          padding: 0.625rem 1.25rem;
          border: none;
          background: transparent;
          color: ${BillingColors.textMuted};
          font-size: 0.875rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          border-radius: ${BillingRadius.md};
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .tab-button:hover:not(.active):not(.disabled) {
          background: rgba(255, 255, 255, 0.5);
          color: ${BillingColors.textStrong};
        }

        .tab-button:focus-visible {
          outline: 2px solid ${BillingColors.borderMedium};
          outline-offset: 2px;
        }

        .tab-button.active {
          background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
          color: white;
          box-shadow: 0 4px 12px rgba(249, 168, 212, 0.35);
        }

        .tab-button.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .segmented-tabs {
            width: 100%;
            display: flex;
            overflow-x: auto;
          }

          .tab-button {
            flex: 1;
            min-width: max-content;
            padding: 0.5rem 1rem;
            font-size: 0.8125rem;
          }
        }
      `}</style>
    </div>
  );
}
