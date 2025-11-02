import { SparklesIcon } from '@heroicons/react/24/outline';
import {
  TemplateColors,
  TemplateGradients,
  TemplateRadius,
  TemplateSpacing,
  TemplateTypography,
} from '@/design/template.tokens';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  title = 'Create your first template',
  description = 'Templates help you reuse your best prompts quickly and consistently.',
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`}>
      <div className="illustration" aria-hidden="true">
        <SparklesIcon />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="template-btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}

      <style jsx>{`
        .empty-state {
          text-align: center;
          padding: ${TemplateSpacing.xl};
          border-radius: ${TemplateRadius.xl};
          background: ${TemplateGradients.subtle};
          color: ${TemplateColors.textSecondary};
        }

        .illustration {
          width: 4rem;
          height: 4rem;
          margin: 0 auto ${TemplateSpacing.md};
          border-radius: ${TemplateRadius.full};
          display: grid;
          place-items: center;
          background: rgba(255, 143, 171, 0.15);
          color: ${TemplateColors.textPrimary};
        }

        .illustration :global(svg) {
          width: 2rem;
          height: 2rem;
        }

        h3 {
          margin: 0;
          font-size: 1.25rem;
          color: ${TemplateColors.textPrimary};
          font-family: ${TemplateTypography.display};
        }

        p {
          margin: ${TemplateSpacing.sm} 0 ${TemplateSpacing.lg};
          color: ${TemplateColors.textSecondary};
          line-height: 1.5;
        }

        button {
          margin-top: ${TemplateSpacing.sm};
        }

        @media (max-width: 640px) {
          .empty-state {
            padding: ${TemplateSpacing.lg};
          }
        }
      `}</style>
    </div>
  );
}

