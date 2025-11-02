'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Template } from '@/api/templates';
import {
  TemplateColors,
  TemplateGradients,
  TemplateRadius,
  TemplateShadows,
  TemplateSpacing,
  TemplateTypography,
} from '@/design/template.tokens';

interface TemplateDetailsDialogProps {
  open: boolean;
  template: Template | null;
  onClose: () => void;
  onCopy: (template: Template) => void;
}

export default function TemplateDetailsDialog({ open, template, onClose, onCopy }: TemplateDetailsDialogProps) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeydown);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [open, onClose]);

  if (!open || !template || typeof window === 'undefined') {
    return null;
  }

  const createdDate = new Date(template.created_at);
  const createdLabel = Number.isNaN(createdDate.getTime()) ? 'Unknown creation time' : createdDate.toLocaleString();

  return createPortal(
    <div className="details-overlay" role="dialog" aria-modal="true" aria-labelledby="template-details-title">
      <div className="overlay-backdrop" onClick={onClose} />
      <article className="details-panel" role="document">
        <header>
          <span className="pill">Template</span>
          <h3 id="template-details-title">{template.title || 'Untitled template'}</h3>
        </header>

        <section className="meta" aria-label="Template metadata">
          <span>{template.word_count} words</span>
          <time dateTime={template.created_at}>Created {createdLabel}</time>
        </section>

        <section className="content" aria-label="Template content">
          <pre>{template.content}</pre>
        </section>

        <footer>
          <button type="button" className="template-btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="template-btn-primary"
            onClick={() => onCopy(template)}
          >
            Copy content
          </button>
        </footer>
      </article>

      <style jsx>{`
        .details-overlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: ${TemplateSpacing.lg};
        }

        .overlay-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(17, 24, 39, 0.38);
        }

        .details-panel {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 640px;
          border-radius: ${TemplateRadius.xl};
          background: ${TemplateColors.surface};
          box-shadow: ${TemplateShadows.card};
          padding: ${TemplateSpacing.xl};
          display: grid;
          gap: ${TemplateSpacing.md};
        }

        header {
          display: flex;
          flex-direction: column;
          gap: ${TemplateSpacing.xs};
        }

        .pill {
          align-self: flex-start;
          background: ${TemplateGradients.pillActive};
          border-radius: ${TemplateRadius.full};
          padding: 0.25rem 0.75rem;
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
        }

        h3 {
          margin: 0;
          font-size: 1.6rem;
          font-family: ${TemplateTypography.display};
          color: ${TemplateColors.textPrimary};
        }

        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: ${TemplateSpacing.sm};
          font-size: 0.95rem;
          color: ${TemplateColors.textSecondary};
        }

        .content {
          background: ${TemplateColors.surfaceSoft};
          border-radius: ${TemplateRadius.lg};
          padding: ${TemplateSpacing.md};
          border: 1px solid rgba(139, 92, 246, 0.12);
          max-height: 320px;
          overflow: auto;
        }

        pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: ${TemplateTypography.sans};
          font-size: 1rem;
          color: ${TemplateColors.textPrimary};
        }

        footer {
          display: flex;
          justify-content: flex-end;
          gap: ${TemplateSpacing.sm};
          flex-wrap: wrap;
        }

        footer button {
          min-width: 7.5rem;
        }

        @media (max-width: 640px) {
          .details-panel {
            padding: ${TemplateSpacing.lg};
          }

          footer {
            flex-direction: column;
            align-items: stretch;
          }

          footer button {
            width: 100%;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
