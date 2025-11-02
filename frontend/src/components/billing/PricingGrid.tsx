/**
 * PricingGrid Component
 * Displays token packages or subscription plans in a responsive grid
 */

import React from 'react';
import {
  BillingColors,
  BillingRadius,
  BillingSpacing,
  BillingShadows,
  BillingGradients,
} from '@/design/billing.tokens';
import GradientButton from './GradientButton';

export interface ProductCard {
  key: string;
  name: string;
  description?: string;
  priceDisplay: string;
  tokens?: number;
  currency: string;
  features?: string[];
  isActive: boolean;
  isCurrentPlan?: boolean;
  disabledReason?: string;
}

export interface PricingGridProps {
  /**
   * Product items to display
   */
  products: ProductCard[];
  /**
   * Callback when a product is selected
   */
  onSelect: (productKey: string) => void;
  /**
   * Variant: 'token' for token packs, 'plan' for subscription plans
   */
  variant?: 'token' | 'plan';
  /**
   * Loading state
   */
  loading?: boolean;
  /**
   * Optional CSS class
   */
  className?: string;
}

export default function PricingGrid({
  products,
  onSelect,
  variant = 'token',
  loading = false,
  className = '',
}: PricingGridProps) {
  if (loading) {
    return (
      <div className={`pricing-grid ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="pricing-card skeleton-card">
            <div className="skeleton-bar" />
            <div className="skeleton-bar" />
            <div className="skeleton-bar" />
          </div>
        ))}
        <style jsx>{`
          .pricing-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: ${BillingSpacing.lg};
          }
          .skeleton-card {
            padding: ${BillingSpacing.lg};
            background: white;
            border-radius: ${BillingRadius.lg};
            border: 2px solid ${BillingColors.borderLight};
            display: flex;
            flex-direction: column;
            gap: ${BillingSpacing.md};
          }
          .skeleton-bar {
            height: 1.5rem;
            background: #e5e7eb;
            border-radius: ${BillingRadius.sm};
          }
        `}</style>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="pricing-empty">
        <p>No products available at the moment.</p>
        <style jsx>{`
          .pricing-empty {
            text-align: center;
            padding: ${BillingSpacing.xl};
            color: ${BillingColors.textMuted};
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`pricing-grid ${className}`} data-testid="pricing-grid">
      {products.map((product) => {
        const isDisabled = !product.isActive || Boolean(product.disabledReason);
        const buttonLabel = product.isCurrentPlan
          ? 'Current Plan'
          : product.disabledReason
          ? product.disabledReason
          : variant === 'token'
          ? 'Purchase'
          : 'Upgrade';

        return (
          <article
            key={product.key}
            className={`pricing-card ${product.isCurrentPlan ? 'current-plan' : ''} ${
              isDisabled ? 'disabled' : ''
            }`}
            data-testid={`pricing-card-${product.key}`}
          >
            <div className="card-header">
              <h3 className="card-title">
                {product.name}
                {product.isCurrentPlan && <span className="current-badge">Current</span>}
              </h3>
              {product.tokens != null && (
                <div className="card-tokens">{product.tokens.toLocaleString()} tokens</div>
              )}
            </div>

            <div className="card-price">
              <span className="price-amount">{product.priceDisplay}</span>
              <span className="price-currency">{product.currency}</span>
            </div>

            {product.description && (
              <p className="card-description">{product.description}</p>
            )}

            {product.features && product.features.length > 0 && (
              <ul className="card-features">
                {product.features.map((feature, idx) => (
                  <li key={idx} className="feature-item">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="card-actions">
              <GradientButton
                variant={product.isCurrentPlan ? 'secondary' : 'primary'}
                onClick={() => onSelect(product.key)}
                disabled={isDisabled}
                title={product.disabledReason}
                size="md"
                style={{ width: '100%' }}
                data-testid={`pricing-button-${product.key}`}
              >
                {buttonLabel}
              </GradientButton>
            </div>
          </article>
        );
      })}

      <style jsx>{`
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: ${BillingSpacing.lg};
        }

        .pricing-card {
          position: relative;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(16px);
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          border: 2px solid ${BillingColors.borderLight};
          box-shadow: ${BillingShadows.card};
          display: flex;
          flex-direction: column;
          transition: all 0.3s ease;
        }

        .pricing-card:hover:not(.disabled) {
          box-shadow: ${BillingShadows.cardHover};
          transform: translateY(-4px);
          border-color: ${BillingColors.borderMedium};
        }

        .pricing-card.current-plan {
          border-color: ${BillingColors.borderStrong};
          background: linear-gradient(135deg, #fdf2f8 0%, #f7f3ff 100%);
        }

        .pricing-card.disabled {
          opacity: 0.6;
        }

        .card-header {
          margin-bottom: ${BillingSpacing.md};
        }

        .card-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          margin: 0 0 ${BillingSpacing.xs};
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.sm};
        }

        .current-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          background: ${BillingColors.successLight};
          color: ${BillingColors.successDark};
          border-radius: ${BillingRadius.sm};
        }

        .card-tokens {
          font-size: 0.875rem;
          color: ${BillingColors.textMuted};
          font-weight: 500;
        }

        .card-price {
          margin-bottom: ${BillingSpacing.md};
        }

        .price-amount {
          font-size: 2rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          font-variant-numeric: tabular-nums;
        }

        .price-currency {
          font-size: 1rem;
          color: ${BillingColors.textMuted};
          margin-left: 0.25rem;
        }

        .card-description {
          font-size: 0.875rem;
          color: ${BillingColors.textMuted};
          line-height: 1.6;
          margin: 0 0 ${BillingSpacing.md};
        }

        .card-features {
          list-style: none;
          padding: 0;
          margin: 0 0 ${BillingSpacing.lg};
          flex: 1;
        }

        .feature-item {
          display: flex;
          align-items: flex-start;
          gap: ${BillingSpacing.sm};
          padding: ${BillingSpacing.xs} 0;
          font-size: 0.875rem;
          color: ${BillingColors.textMedium};
        }

        .feature-item svg {
          flex-shrink: 0;
          margin-top: 0.125rem;
          color: ${BillingColors.success};
        }

        .card-actions {
          margin-top: auto;
        }

        @media (max-width: 768px) {
          .pricing-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
          .pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1025px) {
          .pricing-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
