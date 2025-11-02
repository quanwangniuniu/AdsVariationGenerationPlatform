'use client';

import { FormEvent, useMemo, useState } from 'react';
import { getWordCount, TemplateCreateInput, WORD_LIMIT } from '@/api/templates';
import {
  TemplateColors,
  TemplateRadius,
  TemplateSpacing,
  TemplateTypography,
  TemplateTransitions,
  TemplateShadows,
} from '@/design/template.tokens';

interface TemplateFormProps {
  onSubmit: (input: TemplateCreateInput) => Promise<boolean> | boolean;
  isSubmitting: boolean;
  errorMessage?: string | null;
  titlePlaceholder?: string;
  contentPlaceholder?: string;
}

export default function TemplateForm({
  onSubmit,
  isSubmitting,
  errorMessage,
  titlePlaceholder = 'Optional title',
  contentPlaceholder = 'Write a clear, reusable prompt... (max 48 English words)',
}: TemplateFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const wordCount = useMemo(() => getWordCount(content), [content]);
  const isTooLong = wordCount > WORD_LIMIT;
  const isEmpty = wordCount === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isTooLong || isEmpty) return;

    const result = await onSubmit({
      title: title.trim().length > 0 ? title.trim() : undefined,
      content,
    });

    if (result) {
      setTitle('');
      setContent('');
    }
  }

  const helperText = isTooLong
    ? 'Please shorten your template before submitting.'
    : 'Templates are moderated automatically. Avoid sensitive terminology.';

  return (
    <form className="template-form" onSubmit={handleSubmit} noValidate>
      <div className="legend">
        <h2>Create Template</h2>
        <p>Create reusable prompts for your projects. Keep them concise and inspiring.</p>
      </div>

      <div className="fields">
        <label htmlFor="template-title">Title</label>
        <input
          id="template-title"
          name="title"
          type="text"
          placeholder={titlePlaceholder}
          value={title}
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
          aria-describedby="template-title-helper"
        />
        <span id="template-title-helper" className="helper">
          Optional – shown only in your template list.
        </span>
      </div>

      <div className="fields">
        <label htmlFor="template-content">Content *</label>
        <textarea
          id="template-content"
          name="content"
          placeholder={contentPlaceholder}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={4}
          aria-describedby="template-word-count template-content-helper"
          aria-invalid={isTooLong || !!errorMessage}
          required
        />
        <div className="form-meta">
          <span id="template-word-count" className={isTooLong ? 'count limit' : 'count'}>
            {wordCount}/{WORD_LIMIT}
          </span>
          <span id="template-content-helper" className="helper">
            {helperText}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="actions">
        <button
          type="submit"
          className="template-btn-primary"
          disabled={isSubmitting || isTooLong || isEmpty}
        >
          {isSubmitting ? 'Creating…' : 'Create template'}
        </button>
      </div>

      <style jsx>{`
        .template-form {
          background: ${TemplateColors.surface};
          border-radius: ${TemplateRadius.lg};
          box-shadow: ${TemplateShadows.card};
          padding: clamp(0.75rem, 1.5vw, 1.25rem);
          display: grid;
          gap: clamp(0.75rem, 1.2vw, 1rem);
          width: 100%;
          max-width: 100%;
          margin: 0;
          box-sizing: border-box;
          animation: fadeInUp 0.6s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .legend h2 {
          margin: 0;
          font-size: clamp(1.3rem, 1.5vw, 1.6rem);
          font-family: ${TemplateTypography.display};
          color: ${TemplateColors.textPrimary};
        }

        .legend p {
          margin: ${TemplateSpacing.xs} 0 0;
          color: ${TemplateColors.textSecondary};
          font-size: clamp(0.8rem, 1.1vw, 0.9rem);
        }

        .fields {
          display: grid;
          gap: ${TemplateSpacing.xs};
        }

        label {
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
        }

        input,
        textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: ${TemplateRadius.lg};
          border: 1px solid rgba(139, 92, 246, 0.15);
          background: ${TemplateColors.surfaceSoft};
          padding: clamp(0.5rem, 0.8vw, 0.7rem);
          font-family: ${TemplateTypography.sans};
          font-size: clamp(0.85rem, 1.1vw, 0.95rem);
          color: ${TemplateColors.textPrimary};
          transition: border ${TemplateTransitions.base}, box-shadow ${TemplateTransitions.base};
        }

        input:focus,
        textarea:focus {
          outline: none;
          border-color: ${TemplateColors.accent};
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
        }

        textarea[aria-invalid='true'] {
          border-color: ${TemplateColors.danger};
        }

        textarea {
          resize: vertical;
          min-height: 100px;
        }

        .form-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: ${TemplateSpacing.sm};
          flex-wrap: wrap;
        }

        .count {
          font-family: ${TemplateTypography.mono};
          color: ${TemplateColors.textMuted};
        }

        .count.limit {
          color: ${TemplateColors.danger};
        }

        .helper {
          color: ${TemplateColors.textMuted};
          font-size: 0.9rem;
        }

        .error {
          padding: ${TemplateSpacing.sm} ${TemplateSpacing.md};
          border-radius: ${TemplateRadius.md};
          background: rgba(248, 113, 113, 0.15);
          color: ${TemplateColors.danger};
          font-size: 0.9rem;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
        }

        button[disabled] {
          opacity: 0.75;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .template-form {
            padding: ${TemplateSpacing.lg};
          }

          .actions {
            justify-content: center;
          }

          .template-btn-primary {
            width: 100%;
          }
        }
      `}</style>
    </form>
  );
}
