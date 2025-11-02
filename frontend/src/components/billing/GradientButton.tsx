/**
 * GradientButton Component
 * Primary gradient button matching billing design system
 */

import React from 'react';
import { BillingGradients, BillingShadows, BillingRadius } from '@/design/billing.tokens';

export interface GradientButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button variant
   */
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * Button size
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Loading state
   */
  loading?: boolean;
  /**
   * Children (button content)
   */
  children: React.ReactNode;
}

export default function GradientButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  disabled,
  className = '',
  ...props
}: GradientButtonProps) {
  const sizeClasses = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={`gradient-btn ${sizeClasses[size]} variant-${variant} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <span className="spinner" role="status" aria-label="Loading">
          <svg className="spinner-icon" viewBox="0 0 24 24">
            <circle
              className="spinner-circle"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              strokeWidth="3"
            />
          </svg>
        </span>
      )}
      <span className={loading ? 'btn-content-loading' : ''}>{children}</span>

      <style jsx>{`
        .gradient-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .gradient-btn:focus-visible {
          outline: 3px solid #e9d5ff;
          outline-offset: 2px;
        }

        .gradient-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          pointer-events: none;
        }

        /* Variants */
        .variant-primary {
          background: ${BillingGradients.full};
          color: white;
          box-shadow: ${BillingShadows.button};
          border-radius: ${BillingRadius.xl};
        }

        .variant-primary:hover:not(:disabled) {
          box-shadow: ${BillingShadows.buttonHover};
          transform: translateY(-2px);
        }

        .variant-primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .variant-secondary {
          background: white;
          color: #8b5cf6;
          border: 2px solid #e9d5ff;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);
          border-radius: ${BillingRadius.md};
        }

        .variant-secondary:hover:not(:disabled) {
          background: #f7f3ff;
          border-color: #c084fc;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
        }

        .variant-danger {
          background: #ef4444;
          color: white;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
          border-radius: ${BillingRadius.md};
        }

        .variant-danger:hover:not(:disabled) {
          background: #dc2626;
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
          transform: translateY(-2px);
        }

        /* Sizes */
        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        .btn-md {
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
        }

        .btn-lg {
          padding: 1rem 2rem;
          font-size: 1.125rem;
        }

        /* Loading spinner */
        .spinner {
          display: inline-flex;
          width: 1em;
          height: 1em;
        }

        .spinner-icon {
          width: 100%;
          height: 100%;
          animation: spin 0.8s linear infinite;
        }

        .spinner-circle {
          stroke: currentColor;
          stroke-linecap: round;
          stroke-dasharray: 50;
          stroke-dashoffset: 25;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .btn-content-loading {
          opacity: 0.7;
        }
      `}</style>
    </button>
  );
}
