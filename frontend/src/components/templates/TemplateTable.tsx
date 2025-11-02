'use client';

import { useMemo, useState } from 'react';
import { Template, getWordCount, WORD_LIMIT } from '@/api/templates';
import {
  TemplateColors,
  TemplateGradients,
  TemplateRadius,
  TemplateSpacing,
  TemplateTypography,
  TemplateTransitions,
  TemplateShadows,
} from '@/design/template.tokens';

interface TemplateTableProps {
  templates: Template[];
  ordering?: string;
  onSort?: (field: string) => void;
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
  onCopy: (template: Template) => void;
  onDetails: (template: Template) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date);
}

function isOrderingActive(ordering: string | undefined, field: string) {
  if (!ordering) return false;
  return ordering.replace('-', '') === field;
}

function isOrderingDesc(ordering: string | undefined, field: string) {
  if (!ordering) return false;
  return ordering === `-${field}`;
}

export default function TemplateTable({
  templates,
  ordering,
  onSort,
  onEdit,
  onDelete,
  onCopy,
  onDetails,
  page,
  pageSize,
  total,
  onPageChange,
}: TemplateTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const totalPages = useMemo(() => {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const handleSort = (field: string) => {
    if (!onSort) return;
    onSort(field);
  };

  const startEdit = (template: Template) => {
    setEditingId(template.id);
    setEditTitle(template.title || '');
    setEditContent(template.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  const saveEdit = (template: Template) => {
    onEdit(template);
    cancelEdit();
  };

  const showDetails = (template: Template) => {
    setDetailsId(template.id);
    setEditingId(null);
  };

  const closeDetails = () => {
    setDetailsId(null);
  };

  return (
    <section className="template-table" aria-label="Template list">
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Content</th>
              <th scope="col">Words</th>
              <th scope="col">
                <button
                  type="button"
                  className={isOrderingActive(ordering, 'created_at') ? 'sortable active' : 'sortable'}
                  onClick={() => handleSort('created_at')}
                  aria-sort={isOrderingActive(ordering, 'created_at') ? (isOrderingDesc(ordering, 'created_at') ? 'descending' : 'ascending') : 'none'}
                >
                  Created
                  <span aria-hidden="true" className="icon">
                    {isOrderingDesc(ordering, 'created_at') ? '▼' : '▲'}
                  </span>
                </button>
              </th>
              <th scope="col" className="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const isEditing = editingId === template.id;
              const isShowingDetails = detailsId === template.id;
              const displayContent = template.content.length > 80
                ? `${template.content.slice(0, 80)}…`
                : template.content;

              if (isShowingDetails) {
                return (
                  <tr key={template.id} className="details-row">
                    <td colSpan={5} className="details-cell">
                      <div className="details-container">
                        <div className="details-header">
                          <h3>{template.title || 'Untitled Template'}</h3>
                          <button type="button" onClick={closeDetails} className="close-btn" aria-label="Close details">
                            ✕
                          </button>
                        </div>
                        <div className="details-content">
                          <div className="detail-group">
                            <label>Content</label>
                            <p className="content-display">{template.content}</p>
                          </div>
                          <div className="details-meta">
                            <div className="detail-group inline">
                              <label>Word Count</label>
                              <span className="mono">{template.word_count}</span>
                            </div>
                            <div className="detail-group inline">
                              <label>Created</label>
                              <span>{formatDate(template.created_at)}</span>
                            </div>
                            {template.updated_at && (
                              <div className="detail-group inline">
                                <label>Updated</label>
                                <span>{formatDate(template.updated_at)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="details-actions">
                          <button type="button" onClick={() => { closeDetails(); onCopy(template); }} className="ghost">
                            Copy Content
                          </button>
                          <button type="button" onClick={() => { closeDetails(); startEdit(template); }} className="ghost">
                            Edit
                          </button>
                          <button type="button" onClick={closeDetails} className="ghost">
                            Close
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              if (isEditing) {
                const wordCount = getWordCount(editContent);
                const isTooLong = wordCount > WORD_LIMIT;

                return (
                  <tr key={template.id} className="editing-row">
                    <td colSpan={5} className="edit-cell">
                      <div className="edit-container">
                        <div className="edit-fields">
                          <div className="field-group">
                            <label>Title</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="Optional title"
                              maxLength={100}
                            />
                          </div>
                          <div className="field-group">
                            <label>Content</label>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={4}
                              className={isTooLong ? 'invalid' : ''}
                            />
                            <span className={isTooLong ? 'word-count error' : 'word-count'}>
                              {wordCount}/{WORD_LIMIT} words
                            </span>
                          </div>
                        </div>
                        <div className="edit-actions">
                          <button type="button" onClick={cancelEdit} className="ghost">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit({ ...template, title: editTitle, content: editContent })}
                            className="ghost"
                            disabled={isTooLong || editContent.length === 0}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={template.id}>
                  <td data-title="Title">{template.title || 'Untitled'}</td>
                  <td data-title="Content" className="content-cell">
                    <span title={template.content}>{displayContent}</span>
                  </td>
                  <td data-title="Words" className="mono">{template.word_count}</td>
                  <td data-title="Created" className="created">{formatDate(template.created_at)}</td>
                  <td data-title="Actions" className="actions">
                    <button type="button" onClick={() => onCopy(template)} className="ghost" aria-label={`Copy template ${template.title || template.id}`}>
                      Copy
                    </button>
                    <button type="button" onClick={() => showDetails(template)} className="ghost" aria-label={`View template ${template.title || template.id}`}>
                      Details
                    </button>
                    <button type="button" onClick={() => startEdit(template)} className="ghost" aria-label={`Edit template ${template.title || template.id}`}>
                      Edit
                    </button>
                    <button type="button" onClick={() => onDelete(template)} className="danger" aria-label={`Delete template ${template.title || template.id}`}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cards" aria-hidden="true">
        {templates.map((template) => {
          const isEditing = editingId === template.id;
          const isShowingDetails = detailsId === template.id;
          const summary = template.content.length > 120
            ? `${template.content.slice(0, 120)}…`
            : template.content;

          if (isShowingDetails) {
            return (
              <article key={`card-${template.id}`} className="card details-card">
                <div className="details-container">
                  <div className="details-header">
                    <h3>{template.title || 'Untitled Template'}</h3>
                    <button type="button" onClick={closeDetails} className="close-btn" aria-label="Close details">
                      ✕
                    </button>
                  </div>
                  <div className="details-content">
                    <div className="detail-group">
                      <label>Content</label>
                      <p className="content-display">{template.content}</p>
                    </div>
                    <div className="details-meta">
                      <div className="detail-group inline">
                        <label>Word Count</label>
                        <span className="mono">{template.word_count}</span>
                      </div>
                      <div className="detail-group inline">
                        <label>Created</label>
                        <span>{formatDate(template.created_at)}</span>
                      </div>
                      {template.updated_at && (
                        <div className="detail-group inline">
                          <label>Updated</label>
                          <span>{formatDate(template.updated_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="details-actions">
                    <button type="button" onClick={() => { closeDetails(); onCopy(template); }} className="ghost">
                      Copy
                    </button>
                    <button type="button" onClick={() => { closeDetails(); startEdit(template); }} className="ghost">
                      Edit
                    </button>
                    <button type="button" onClick={closeDetails} className="ghost">
                      Close
                    </button>
                  </div>
                </div>
              </article>
            );
          }

          if (isEditing) {
            const wordCount = getWordCount(editContent);
            const isTooLong = wordCount > WORD_LIMIT;

            return (
              <article key={`card-${template.id}`} className="card editing-card">
                <div className="edit-container">
                  <div className="edit-fields">
                    <div className="field-group">
                      <label>Title</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Optional title"
                        maxLength={100}
                      />
                    </div>
                    <div className="field-group">
                      <label>Content</label>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                        className={isTooLong ? 'invalid' : ''}
                      />
                      <span className={isTooLong ? 'word-count error' : 'word-count'}>
                        {wordCount}/{WORD_LIMIT} words
                      </span>
                    </div>
                  </div>
                  <div className="edit-actions">
                    <button type="button" onClick={cancelEdit} className="ghost">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit({ ...template, title: editTitle, content: editContent })}
                      className="ghost"
                      disabled={isTooLong || editContent.length === 0}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </article>
            );
          }

          return (
            <article key={`card-${template.id}`} className="card">
              <header>
                <span className="pill">{template.title || 'Untitled'}</span>
                <time dateTime={template.created_at}>{formatDate(template.created_at)}</time>
              </header>
              <p title={template.content}>{summary}</p>
              <footer>
                <span className="mono">{template.word_count} words</span>
                <div className="actions">
                  <button type="button" onClick={() => onCopy(template)} className="ghost">
                    Copy
                  </button>
                  <button type="button" onClick={() => showDetails(template)} className="ghost">
                    Details
                  </button>
                  <button type="button" onClick={() => startEdit(template)} className="ghost">
                    Edit
                  </button>
                  <button type="button" onClick={() => onDelete(template)} className="danger">
                    Delete
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>

      <nav className="pagination" aria-label="Template pagination">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="page-status">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
        </button>
      </nav>

      <style jsx>{`
        .template-table {
          display: grid;
          gap: ${TemplateSpacing.lg};
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          animation: fadeInUp 0.6s ease-out 0.15s both;
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

        .table-wrapper {
          border-radius: ${TemplateRadius.lg};
          box-shadow: ${TemplateShadows.card};
          overflow-x: auto;
          overflow-y: hidden;
          background: ${TemplateColors.surface};
          font-size: clamp(0.85rem, 1.3vw, 1rem);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        .table-wrapper::-webkit-scrollbar {
          height: 8px;
        }

        .table-wrapper::-webkit-scrollbar-track {
          background: ${TemplateColors.surfaceSoft};
          border-radius: 0 0 ${TemplateRadius.lg} ${TemplateRadius.lg};
        }

        .table-wrapper::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: ${TemplateRadius.full};
        }

        .table-wrapper::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }

        table {
          width: 100%;
          min-width: 800px;
          border-collapse: collapse;
        }

        thead {
          background: ${TemplateColors.surfaceSoft};
        }

        th,
        td {
          padding: clamp(0.5rem, 1.5vw, ${TemplateSpacing.md});
          text-align: left;
          color: ${TemplateColors.textSecondary};
        }

        th {
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
          text-transform: uppercase;
          font-size: clamp(0.7rem, 1.2vw, 0.85rem);
          letter-spacing: 0.05em;
        }

        tbody tr {
          animation: fadeInRow 0.4s ease-out both;
        }

        tbody tr:nth-child(1) { animation-delay: 0.05s; }
        tbody tr:nth-child(2) { animation-delay: 0.1s; }
        tbody tr:nth-child(3) { animation-delay: 0.15s; }
        tbody tr:nth-child(4) { animation-delay: 0.2s; }
        tbody tr:nth-child(5) { animation-delay: 0.25s; }

        @keyframes fadeInRow {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        tbody tr:nth-child(every) {
          background: ${TemplateColors.surface};
        }

        tbody tr:hover {
          background: rgba(249, 245, 255, 0.45);
          transform: scale(1.005);
        }

        .editing-row {
          background: linear-gradient(135deg, rgba(249, 245, 255, 0.8) 0%, rgba(255, 249, 245, 0.8) 100%) !important;
        }

        .editing-row:hover {
          transform: none !important;
        }

        .details-row {
          background: linear-gradient(135deg, rgba(255, 249, 245, 0.85) 0%, rgba(249, 245, 255, 0.85) 100%) !important;
        }

        .details-row:hover {
          transform: none !important;
        }

        .edit-cell,
        .details-cell {
          padding: ${TemplateSpacing.lg} !important;
        }

        .edit-container {
          background: ${TemplateColors.surface};
          border-radius: ${TemplateRadius.lg};
          padding: ${TemplateSpacing.lg};
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
          border: 2px solid rgba(139, 92, 246, 0.2);
          animation: expandIn 0.3s ease-out;
        }

        @keyframes expandIn {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .edit-fields {
          display: grid;
          gap: ${TemplateSpacing.md};
          margin-bottom: ${TemplateSpacing.md};
        }

        .field-group {
          display: grid;
          gap: ${TemplateSpacing.xs};
        }

        .field-group label {
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
          font-size: 0.9rem;
        }

        .field-group input,
        .field-group textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: ${TemplateRadius.md};
          border: 1.5px solid rgba(139, 92, 246, 0.15);
          background: ${TemplateColors.surfaceSoft};
          padding: clamp(0.6rem, 0.9vw, 0.75rem);
          font-family: ${TemplateTypography.sans};
          font-size: 0.95rem;
          color: ${TemplateColors.textPrimary};
          transition: border ${TemplateTransitions.base}, box-shadow ${TemplateTransitions.base};
        }

        .field-group input:focus,
        .field-group textarea:focus {
          outline: none;
          border-color: ${TemplateColors.accent};
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
        }

        .field-group textarea {
          resize: vertical;
          min-height: 100px;
        }

        .field-group textarea.invalid {
          border-color: ${TemplateColors.danger};
        }

        .word-count {
          font-family: ${TemplateTypography.mono};
          font-size: 0.85rem;
          color: ${TemplateColors.textMuted};
        }

        .word-count.error {
          color: ${TemplateColors.danger};
          font-weight: 600;
        }

        .edit-actions {
          display: flex;
          gap: ${TemplateSpacing.sm};
          justify-content: flex-end;
        }

        .edit-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .details-container {
          background: ${TemplateColors.surface};
          border-radius: ${TemplateRadius.lg};
          padding: ${TemplateSpacing.lg};
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
          border: 2px solid rgba(139, 92, 246, 0.2);
          animation: expandIn 0.3s ease-out;
        }

        .details-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: ${TemplateSpacing.md};
          margin-bottom: ${TemplateSpacing.lg};
          padding-bottom: ${TemplateSpacing.md};
          border-bottom: 2px solid rgba(139, 92, 246, 0.15);
        }

        .details-header h3 {
          margin: 0;
          font-size: 1.4rem;
          font-family: ${TemplateTypography.display};
          color: ${TemplateColors.textPrimary};
        }

        .close-btn {
          border: none;
          background: transparent;
          font-size: 1.5rem;
          line-height: 1;
          color: ${TemplateColors.textMuted};
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: ${TemplateRadius.md};
          transition: all ${TemplateTransitions.base};
        }

        .close-btn:hover {
          background: rgba(139, 92, 246, 0.1);
          color: ${TemplateColors.textPrimary};
          transform: scale(1.1);
        }

        .details-content {
          display: grid;
          gap: ${TemplateSpacing.lg};
        }

        .detail-group {
          display: grid;
          gap: ${TemplateSpacing.xs};
        }

        .detail-group.inline {
          display: flex;
          align-items: baseline;
          gap: ${TemplateSpacing.sm};
        }

        .detail-group label {
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
          font-size: 0.9rem;
        }

        .detail-group.inline label {
          color: ${TemplateColors.textSecondary};
        }

        .content-display {
          margin: 0;
          padding: ${TemplateSpacing.md};
          background: ${TemplateColors.surfaceSoft};
          border-radius: ${TemplateRadius.md};
          color: ${TemplateColors.textSecondary};
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .details-meta {
          display: flex;
          flex-wrap: wrap;
          gap: ${TemplateSpacing.md};
          padding: ${TemplateSpacing.md};
          background: ${TemplateColors.surfaceSoft};
          border-radius: ${TemplateRadius.md};
        }

        .details-actions {
          display: flex;
          gap: ${TemplateSpacing.sm};
          justify-content: flex-end;
          margin-top: ${TemplateSpacing.md};
          padding-top: ${TemplateSpacing.md};
          border-top: 1px solid rgba(139, 92, 246, 0.1);
        }

        .content-cell span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: clamp(16rem, 40vw, 36rem);
        }

        .mono {
          font-family: ${TemplateTypography.mono};
          color: ${TemplateColors.textPrimary};
        }

        .created {
          color: ${TemplateColors.textSecondary};
          white-space: nowrap;
        }

        .actions {
          display: flex;
          gap: ${TemplateSpacing.xs};
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .actions-header {
          text-align: right;
        }

        .ghost,
        .danger {
          border: none;
          background: transparent;
          font-weight: 600;
          cursor: pointer;
          padding: 0.35rem 0.75rem;
          border-radius: ${TemplateRadius.full};
          transition: all ${TemplateTransitions.base};
          position: relative;
        }

        .ghost {
          color: ${TemplateColors.textAccent};
        }

        .ghost:hover {
          background: rgba(139, 92, 246, 0.1);
          transform: translateY(-1px);
        }

        .ghost:active {
          transform: translateY(0);
        }

        .danger {
          color: #DC2626;
        }

        .danger:hover {
          background: rgba(248, 113, 113, 0.18);
          transform: translateY(-1px);
        }

        .danger:active {
          transform: translateY(0);
        }

        .sortable {
          border: none;
          background: transparent;
          font: inherit;
          color: inherit;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
          padding: 0;
        }

        .sortable .icon {
          font-size: 0.7rem;
        }

        .sortable.active {
          color: ${TemplateColors.textAccent};
        }

        .cards {
          display: none;
          gap: ${TemplateSpacing.md};
        }

        .card {
          background: ${TemplateColors.surface};
          padding: clamp(1rem, 2.5vw, ${TemplateSpacing.lg});
          border-radius: ${TemplateRadius.xl};
          box-shadow: ${TemplateShadows.card};
          display: grid;
          gap: clamp(0.5rem, 1.5vw, ${TemplateSpacing.md});
          transition: transform ${TemplateTransitions.base}, box-shadow ${TemplateTransitions.base};
          font-size: clamp(0.85rem, 1.3vw, 1rem);
          animation: fadeInCard 0.5s ease-out both;
        }

        .card:nth-child(1) { animation-delay: 0.1s; }
        .card:nth-child(2) { animation-delay: 0.2s; }
        .card:nth-child(3) { animation-delay: 0.3s; }
        .card:nth-child(4) { animation-delay: 0.4s; }
        .card:nth-child(5) { animation-delay: 0.5s; }

        @keyframes fadeInCard {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .card:hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 12px 24px rgba(139, 92, 246, 0.2);
        }

        .card:active {
          transform: translateY(-2px) scale(1.01);
        }

        .card.editing-card {
          background: linear-gradient(135deg, rgba(249, 245, 255, 0.9) 0%, rgba(255, 249, 245, 0.9) 100%);
          transform: none !important;
          box-shadow: 0 8px 20px rgba(139, 92, 246, 0.2) !important;
        }

        .card.editing-card:hover {
          transform: none !important;
        }

        .card.editing-card .edit-container {
          padding: 0;
          box-shadow: none;
          border: none;
          background: transparent;
        }

        .card.details-card {
          background: linear-gradient(135deg, rgba(255, 249, 245, 0.95) 0%, rgba(249, 245, 255, 0.95) 100%);
          transform: none !important;
          box-shadow: 0 8px 20px rgba(139, 92, 246, 0.2) !important;
        }

        .card.details-card:hover {
          transform: none !important;
        }

        .card.details-card .details-container {
          padding: 0;
          box-shadow: none;
          border: none;
          background: transparent;
        }

        .card header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: ${TemplateSpacing.sm};
          flex-wrap: wrap;
        }

        .pill {
          background: ${TemplateGradients.pillActive};
          border-radius: ${TemplateRadius.full};
          padding: 0.25rem 0.75rem;
          font-weight: 600;
          color: ${TemplateColors.textPrimary};
          font-size: 0.9rem;
        }

        article time {
          font-size: 0.85rem;
          color: ${TemplateColors.textMuted};
          white-space: nowrap;
        }

        article p {
          margin: 0;
          color: ${TemplateColors.textSecondary};
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card footer {
          display: flex;
          flex-direction: column;
          gap: ${TemplateSpacing.sm};
        }

        .card footer .mono {
          font-size: 0.85rem;
        }

        .card .actions {
          display: flex;
          gap: ${TemplateSpacing.xs};
          flex-wrap: wrap;
          justify-content: flex-start;
        }

        .card .actions button {
          flex: 0 0 auto;
          font-size: 0.9rem;
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: ${TemplateSpacing.sm};
          flex-wrap: wrap;
        }

        .pagination button {
          border: none;
          border-radius: ${TemplateRadius.full};
          padding: 0.45rem 1.1rem;
          cursor: pointer;
          background: rgba(139, 92, 246, 0.12);
          color: ${TemplateColors.textAccent};
          transition: all ${TemplateTransitions.base};
          font-weight: 600;
        }

        .pagination button:hover:not(:disabled) {
          background: rgba(139, 92, 246, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(139, 92, 246, 0.15);
        }

        .pagination button:active:not(:disabled) {
          transform: translateY(0);
        }

        .pagination button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-status {
          font-weight: 600;
          color: ${TemplateColors.textSecondary};
        }

        @media (max-width: 900px) {
          .table-wrapper {
            display: none;
          }

          .cards {
            display: grid;
          }

          .pagination {
            justify-content: center;
          }
        }
      `}</style>
    </section>
  );
}
