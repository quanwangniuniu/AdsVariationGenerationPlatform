import React from 'react';
import {
  BillingColors,
  BillingGradients,
  BillingRadius,
  BillingShadows,
  BillingSpacing,
} from '@/design/billing.tokens';
import GradientButton from './GradientButton';

export interface WorkspaceUsageCardProps {
  usage?: {
    member_count: number;
    max_users: number;
    storage_used_gb: number;
    max_storage_gb: number;
  } | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
  status?: 'normal' | 'warning' | 'critical';
  statusMessage?: string | null;
}

export default function WorkspaceUsageCard({
  usage,
  loading = false,
  error = null,
  onRefresh,
  className = '',
  status = 'normal',
  statusMessage = null,
}: WorkspaceUsageCardProps) {
  const capacityPercent = usage?.max_users
    ? Math.min(100, Math.round((usage.member_count / usage.max_users) * 100))
    : null;
  const storagePercent = usage?.max_storage_gb
    ? Math.min(100, Math.round((usage.storage_used_gb / usage.max_storage_gb) * 100))
    : null;

  const statusTone: Record<typeof status, { label: string; className: string }> = {
    normal: { label: 'Within plan limits', className: 'tone-normal' },
    warning: { label: 'Approaching limits', className: 'tone-warning' },
    critical: { label: 'Limits exceeded', className: 'tone-critical' },
  };

  const toneClass = statusTone[status] ?? statusTone.normal;

  return (
    <div className={`usage-card ${className}`} data-testid="usage-card">
      <header className="usage-header">
        <div className="usage-heading">
          <span className="usage-label">Usage Overview</span>
          <h3 className="usage-title">Workspace Capacity</h3>
        </div>
        <div className="usage-meta">
          <span className={`usage-chip ${toneClass.className}`}>{toneClass.label}</span>
          {onRefresh && (
            <GradientButton
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh usage snapshot"
            >
              Refresh
            </GradientButton>
          )}
        </div>
      </header>

      {statusMessage && (
        <div className={`usage-banner ${toneClass.className}`} role="status">
          {statusMessage}
        </div>
      )}

      {loading ? (
        <div className="usage-skeleton" aria-busy="true">
          <div className="skeleton-bar large" />
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
        </div>
      ) : error ? (
        <div className="usage-error" role="alert">
          <span className="error-icon">⚠️</span>
          <div>
            <p className="error-title">Unable to load usage</p>
            <p className="error-text">{error}</p>
          </div>
        </div>
      ) : usage ? (
        <div className="usage-body">
          <div className="usage-metric" data-testid="usage-members">
            <div className="metric-header">
              <span className="metric-label">Active Members</span>
              {capacityPercent != null && (
                <span className="metric-chip">{capacityPercent}% used</span>
              )}
            </div>
            <div className="metric-value">
              {usage.member_count}
              <span className="metric-sub">
                {usage.max_users ? `of ${usage.max_users}` : 'members'}
              </span>
            </div>
            {capacityPercent != null && (
              <ProgressBar percent={capacityPercent} tone="members" />
            )}
          </div>

          <div className="usage-metric" data-testid="usage-storage">
            <div className="metric-header">
              <span className="metric-label">Storage Used</span>
              {storagePercent != null && (
                <span className="metric-chip">{storagePercent}% used</span>
              )}
            </div>
            <div className="metric-value">
              {usage.storage_used_gb.toFixed(2)}
              <span className="metric-sub">
                {usage.max_storage_gb ? `GB of ${usage.max_storage_gb} GB` : 'GB'}
              </span>
            </div>
            {storagePercent != null && (
              <ProgressBar percent={storagePercent} tone="storage" />
            )}
          </div>
        </div>
      ) : (
        <div className="usage-empty">
          <span className="empty-icon">🌤️</span>
          <p>No usage data recorded yet.</p>
        </div>
      )}

      <style jsx>{`
        .usage-card {
          background: ${BillingGradients.warm};
          border-radius: ${BillingRadius.xl};
          padding: ${BillingSpacing.lg};
          box-shadow: ${BillingShadows.card};
          border: 1px solid ${BillingColors.borderLight};
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.md};
        }

        .usage-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: ${BillingSpacing.md};
        }

        .usage-heading {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.xs};
        }

        .usage-label {
          display: inline-block;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: ${BillingColors.textMuted};
          font-weight: 600;
        }

        .usage-title {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          letter-spacing: -0.01em;
        }

        .usage-meta {
          display: inline-flex;
          gap: ${BillingSpacing.sm};
          align-items: center;
          flex-wrap: wrap;
        }

        .usage-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.75rem;
          border-radius: ${BillingRadius.full};
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .usage-chip.tone-normal {
          background: rgba(255, 255, 255, 0.6);
          color: ${BillingColors.textMuted};
        }

        .usage-chip.tone-warning {
          background: ${BillingColors.warningLight};
          color: ${BillingColors.warningDark};
        }

        .usage-chip.tone-critical {
          background: ${BillingColors.dangerLight};
          color: ${BillingColors.dangerDark};
        }

        .usage-banner {
          padding: ${BillingSpacing.sm} ${BillingSpacing.md};
          border-radius: ${BillingRadius.md};
          font-size: 0.875rem;
          font-weight: 600;
        }

        .usage-banner.tone-normal {
          background: rgba(255, 255, 255, 0.4);
          color: ${BillingColors.textMuted};
        }

        .usage-banner.tone-warning {
          background: ${BillingColors.warningLight};
          color: ${BillingColors.warningDark};
        }

        .usage-banner.tone-critical {
          background: ${BillingColors.dangerLight};
          color: ${BillingColors.dangerDark};
        }

        .usage-body {
          display: grid;
          gap: ${BillingSpacing.lg};
        }

        .usage-metric {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
        }

        .metric-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: ${BillingColors.textMuted};
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value {
          font-size: 2rem;
          font-weight: 700;
          color: ${BillingColors.textStrong};
          display: flex;
          align-items: baseline;
          gap: ${BillingSpacing.xs};
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-chip {
          padding: 0.25rem 0.6rem;
          border-radius: ${BillingRadius.full};
          background: rgba(255, 255, 255, 0.6);
          font-size: 0.75rem;
          font-weight: 600;
          color: ${BillingColors.textMuted};
        }

        .metric-sub {
          font-size: 0.875rem;
          color: ${BillingColors.textMedium};
        }

        .usage-skeleton {
          display: flex;
          flex-direction: column;
          gap: ${BillingSpacing.sm};
        }

        .skeleton-bar {
          height: 1rem;
          border-radius: ${BillingRadius.sm};
          background: rgba(255, 255, 255, 0.6);
          overflow: hidden;
          position: relative;
        }

        .skeleton-bar.large {
          height: 2.5rem;
          width: 60%;
        }

        .skeleton-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
          animation: shimmer 1.4s infinite;
        }

        .usage-error {
          display: flex;
          gap: ${BillingSpacing.md};
          background: rgba(254, 226, 226, 0.8);
          border: 1px solid #fca5a5;
          border-radius: ${BillingRadius.lg};
          padding: ${BillingSpacing.md};
          color: ${BillingColors.dangerDark};
        }

        .error-icon {
          font-size: 1.25rem;
        }

        .error-title {
          margin: 0;
          font-weight: 600;
        }

        .error-text {
          margin: 0.25rem 0 0;
          font-size: 0.85rem;
        }

        .usage-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: ${BillingSpacing.sm};
          color: ${BillingColors.textMuted};
          text-align: center;
        }

        .empty-icon {
          font-size: 2rem;
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @media (min-width: 768px) {
          .usage-body {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .usage-card {
            padding: ${BillingSpacing.md};
            gap: ${BillingSpacing.sm};
          }

          .usage-meta {
            width: 100%;
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

interface ProgressBarProps {
  percent: number;
  tone: 'members' | 'storage';
}

function ProgressBar({ percent, tone }: ProgressBarProps) {
  const gradient =
    tone === 'members'
      ? 'linear-gradient(135deg, #c084fc, #f472b6)'
      : 'linear-gradient(135deg, #38bdf8, #818cf8)';

  return (
    <div className="progress">
      <div className="track">
        <div className="fill" style={{ width: `${percent}%`, background: gradient }} />
      </div>
      <span className="percent">{percent}%</span>

      <style jsx>{`
        .progress {
          display: flex;
          align-items: center;
          gap: ${BillingSpacing.sm};
        }

        .track {
          flex: 1;
          height: 0.55rem;
          background: rgba(255, 255, 255, 0.6);
          border-radius: ${BillingRadius.full};
          overflow: hidden;
        }

        .fill {
          height: 100%;
          border-radius: ${BillingRadius.full};
          transition: width 0.4s ease;
          box-shadow: 0 8px 24px rgba(249, 168, 212, 0.3);
        }

        .percent {
          font-size: 0.75rem;
          font-weight: 600;
          color: ${BillingColors.textMedium};
        }
      `}</style>
    </div>
  );
}
