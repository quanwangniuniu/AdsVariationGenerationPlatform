import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';

import {
  TemplateColors,
  TemplateGradients,
  TemplateRadius,
  TemplateShadows,
  TemplateSpacing,
  TemplateTypography,
} from '@/design/template.tokens';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!open || typeof window === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="template-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
      <div className="backdrop" onClick={onCancel} />
      <div className="panel" role="document">
        <div className="icon" aria-hidden="true">
          <ExclamationCircleIcon />
        </div>
        <h3 id="confirm-title">{title}</h3>
        {description && (
          <p id="confirm-desc">{description}</p>
        )}
        <div className="actions">
          <button type="button" className="template-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="template-btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        .template-confirm {
          position: fixed;
          inset: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: ${TemplateSpacing.lg};
        }

        .backdrop {
          position: absolute;
          inset: 0;
          background: rgba(17, 24, 39, 0.38);
        }

        .panel {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          padding: ${TemplateSpacing.xl};
          border-radius: ${TemplateRadius.xl};
          background: ${TemplateColors.surface};
          box-shadow: ${TemplateShadows.card};
          text-align: center;
        }

        .icon {
          width: 4rem;
          height: 4rem;
          margin: 0 auto ${TemplateSpacing.md};
          border-radius: ${TemplateRadius.full};
          background: ${TemplateGradients.subtle};
          display: grid;
          place-items: center;
        }

        .icon :global(svg) {
          width: 2rem;
          height: 2rem;
          color: ${TemplateColors.textPrimary};
        }

        h3 {
          margin: 0;
          font-family: ${TemplateTypography.display};
          font-size: 1.35rem;
          color: ${TemplateColors.textPrimary};
        }

        p {
          margin: ${TemplateSpacing.sm} 0 ${TemplateSpacing.lg};
          color: ${TemplateColors.textSecondary};
          line-height: 1.6;
        }

        .actions {
          display: flex;
          justify-content: center;
          gap: ${TemplateSpacing.sm};
          flex-wrap: wrap;
        }

        .template-btn-secondary,
        .template-btn-danger {
          min-width: 7.5rem;
        }

        @media (max-width: 640px) {
          .panel {
            padding: ${TemplateSpacing.lg};
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}

