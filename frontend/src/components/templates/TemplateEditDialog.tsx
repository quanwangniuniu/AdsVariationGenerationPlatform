'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Template, TemplateUpdateInput, getWordCount, WORD_LIMIT } from '@/api/templates';
import {
  TemplateColors,
  TemplateGradients,
  TemplateRadius,
  TemplateShadows,
  TemplateSpacing,
  TemplateTypography,
  TemplateTransitions,
} from '@/design/template.tokens';

interface TemplateEditDialogProps {
  open: boolean;
  template: Template | null;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (id: string, payload: TemplateUpdateInput) => Promise<boolean> | boolean;
}

export default function TemplateEditDialog({
  open,
  template,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: TemplateEditDialogProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (template) {
      setTitle(template.title ?? '');
      setContent(template.content);
    }
  }, [template]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
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
  }, [open, onClose]);

  const wordCount = useMemo(() => getWordCount(content), [content]);
  const isTooLong = wordCount > WORD_LIMIT;
  const isDirty = template ? (title !== (template.title ?? '') || content !== template.content) : false;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!template || isTooLong || !isDirty) {
      onClose();
      return;
    }

    const result = await onSubmit(template.id, {
      title: title.trim().length > 0 ? title.trim() : '',
      content,
    });

    if (result) {
      onClose();
    }
  }

  if (!open || !template || typeof window === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="template-edit" role="dialog" aria-modal="true" aria-labelledby="template-edit-title">
      <div className="backdrop" onClick={onClose} />
      <form className="panel" role="document" onSubmit={handleSubmit}>
        <header>
          <span className="pill">Editing</span>
          <h3 id="template-edit-title">{template.title || 'Untitled template'}</h3>
        </header>

        <label htmlFor="edit-title">Title</label>
        <input
          id="edit-title"
          name="title"
          type="text"
          maxLength={100}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <label htmlFor="edit-content">Content</label>
        <textarea
          id="edit-content"
          name="content"
          value={content}
          rows={6}
          onChange={(event) => setContent(event.target.value)}
          aria-invalid={isTooLong}
          aria-describedby="edit-word-count"
          required
        />

        <div className="meta">
          <span id="edit-word-count" className={isTooLong ? 'count limit' : 'count'}>
            {wordCount}/{WORD_LIMIT}
          </span>
          {errorMessage && <span className="error" role="alert">{errorMessage}</span>}
        </div>

        <footer>
          <button type="button" className="template-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="template-btn-primary"
            disabled={!isDirty || isTooLong || isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>

      <style jsx>{`
        .template-edit {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: ${TemplateSpacing.lg};
        }

        .backdrop {
          position: absolute;
          inset: 0;
          background: rgba(17, 24, 39, 0.45);
        }

        .panel {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 620px;
          display: grid;
          gap: ${TemplateSpacing.sm};
          padding: ${TemplateSpacing.xl};
          border-radius: ${TemplateRadius.xl};
          background: ${TemplateColors.surface};
          box-shadow: ${TemplateShadows.card};
        }

        header {
          display: flex;
          align-items: center;
          gap: ${TemplateSpacing.sm};
        }

        .pill {
          background: ${TemplateGradients.pillActive};
          border-radius: ${TemplateRadius.full};
          padding: 0.25rem 0.75rem;
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
        }

        h3 {
          margin: 0;
          font-size: 1.5rem;
          font-family: ${TemplateTypography.display};
          color: ${TemplateColors.textPrimary};
        }

        label {
          font-weight: 600;
          margin-top: ${TemplateSpacing.sm};
          color: ${TemplateColors.textSecondary};
        }

        input,
        textarea {
          width: 100%;
          border-radius: ${TemplateRadius.lg};
          border: 1px solid rgba(139, 92, 246, 0.18);
          padding: ${TemplateSpacing.sm} ${TemplateSpacing.md};
          font-size: 1rem;
          font-family: ${TemplateTypography.sans};
          background: ${TemplateColors.surfaceSoft};
          transition: border ${TemplateTransitions.base}, box-shadow ${TemplateTransitions.base};
        }

        input:focus,
        textarea:focus {
          outline: none;
          border-color: ${TemplateColors.accent};
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.22);
        }

        textarea {
          min-height: 10rem;
          resize: vertical;
        }

        textarea[aria-invalid='true'] {
          border-color: ${TemplateColors.danger};
        }

        .meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: ${TemplateSpacing.xs};
        }

        .count {
          font-family: ${TemplateTypography.mono};
          color: ${TemplateColors.textMuted};
        }

        .count.limit {
          color: ${TemplateColors.danger};
        }

        .error {
          color: ${TemplateColors.danger};
          font-weight: 600;
        }

        footer {
          display: flex;
          justify-content: flex-end;
          gap: ${TemplateSpacing.sm};
          margin-top: ${TemplateSpacing.sm};
        }

        .template-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .panel {
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

