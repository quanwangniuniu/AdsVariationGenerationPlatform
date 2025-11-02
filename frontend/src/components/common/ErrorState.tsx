import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  TemplateColors,
  TemplateRadius,
  TemplateSpacing,
  TemplateShadows,
  TemplateTypography,
} from '@/design/template.tokens';

interface ErrorStateProps {
  title?: string;
  description?: string;
  code?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export default function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  code,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`template-card error-state ${className}`} role="alert" aria-live="polite">
      <div className="icon" aria-hidden="true">
        <ExclamationTriangleIcon />
      </div>
      <div className="content">
        <h3>{title}</h3>
        <p>{description}</p>
        {code && (
          <span className="code">Error code: {code}</span>
        )}
      </div>
      {onRetry && (
        <button type="button" className="template-btn-primary retry" onClick={onRetry}>
          {retryLabel}
        </button>
      )}

      <style jsx>{`
        .error-state {
          display: flex;
          align-items: center;
          gap: ${TemplateSpacing.lg};
          padding: ${TemplateSpacing.lg};
          background: ${TemplateColors.surfaceSoft};
          border-radius: ${TemplateRadius.lg};
          box-shadow: ${TemplateShadows.card};
        }

        .icon {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 3rem;
          height: 3rem;
          border-radius: ${TemplateRadius.full};
          background: ${TemplateColors.accentSoft};
          color: ${TemplateColors.accent};
        }

        .icon :global(svg) {
          width: 1.5rem;
          height: 1.5rem;
        }

        .content {
          flex: 1;
        }

        h3 {
          margin: 0 0 ${TemplateSpacing.xs} 0;
          font-size: 1.125rem;
          color: ${TemplateColors.textPrimary};
        }

        p {
          margin: 0;
          color: ${TemplateColors.textSecondary};
          line-height: 1.5;
        }

        .code {
          display: inline-block;
          margin-top: ${TemplateSpacing.sm};
          font-family: ${TemplateTypography.mono};
          font-size: 0.85rem;
          color: ${TemplateColors.textMuted};
        }

        .retry {
          align-self: flex-start;
          white-space: nowrap;
        }

        @media (max-width: 640px) {
          .error-state {
            flex-direction: column;
            align-items: flex-start;
          }

          .retry {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
