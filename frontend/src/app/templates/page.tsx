'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TemplateForm from '@/components/templates/TemplateForm';
import TemplateTable from '@/components/templates/TemplateTable';
import TemplateEditDialog from '@/components/templates/TemplateEditDialog';
import TemplateDetailsDialog from '@/components/templates/TemplateDetailsDialog';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ErrorState from '@/components/common/ErrorState';
import EmptyState from '@/components/common/EmptyState';
import SkeletonTable from '@/components/common/SkeletonTable';
import { Template, TemplateCreateInput, TemplateUpdateInput } from '@/api/templates';
import { ensureApiError, useTemplateMutations, useTemplates } from '@/hooks/useTemplates';
import { useClipboard } from '@/hooks/useClipboard';
import { redirectToAuthWithNext, verifySession } from '@/lib/authHelpers';
import {
  TemplateColors,
  TemplateGradients,
  TemplateRadius,
  TemplateShadows,
  TemplateSpacing,
  TemplateTypography,
  TemplateTransitions,
} from '@/design/template.tokens';

interface ToastState {
  type: 'success' | 'error' | 'info';
  message: string;
}

const PAGE_SIZE = 10;

export default function TemplatesPage() {
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState('-created_at');
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [detailsTemplate, setDetailsTemplate] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const { data, isLoading, error, refetch, params } = useTemplates({
    page,
    pageSize: PAGE_SIZE,
    ordering,
    enabled: authChecked && isAuthed,
  });
  const { create, update, remove, getErrorMessage } = useTemplateMutations({ page, pageSize: PAGE_SIZE, ordering });
  const { copy, error: clipboardError } = useClipboard();

  const templates = data?.results ?? [];
  const total = data?.count ?? 0;

  useEffect(() => {
    let active = true;

    const guard = async () => {
      try {
        const authed = await verifySession();
        if (!active) return;
        if (authed) {
          setIsAuthed(true);
        } else {
          setIsAuthed(false);
          redirectToAuthWithNext(0);
        }
      } catch {
        if (!active) return;
        setIsAuthed(false);
        redirectToAuthWithNext(0);
      } finally {
        if (active) {
          setAuthChecked(true);
        }
      }
    };

    guard();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (clipboardError) {
      setToast({ type: 'error', message: clipboardError });
    }
  }, [clipboardError]);

  async function handleCreate(input: TemplateCreateInput): Promise<boolean> {
    setFormError(null);
    try {
      await create.mutateAsync(input);
      setToast({ type: 'success', message: 'Template created.' });
      if (page !== 1) {
        setPage(1);
      }
      return true;
    } catch (err) {
      const apiErr = ensureApiError(err);
      const friendly = getErrorMessage(apiErr);
      setFormError(friendly);
      setToast({ type: 'error', message: friendly });
      return false;
    }
  }

  function toggleOrdering(field: string) {
    setOrdering((current) => {
      const next = current === field ? `-${field}` : current === `-${field}` ? field : field;
      if (page !== 1) {
        setPage(1);
      }
      return next;
    });
  }

  async function handleCopy(template: Template) {
    const success = await copy(template.content);
    if (success) {
      setToast({ type: 'success', message: 'Copied to clipboard.' });
    } else {
      setToast({ type: 'error', message: 'Copy failed. Please copy manually.' });
    }
  }

  async function handleUpdate(id: string, payload: TemplateUpdateInput): Promise<boolean> {
    setEditError(null);
    try {
      await update.mutateAsync({ id, payload });
      setToast({ type: 'success', message: 'Template updated.' });
      return true;
    } catch (err) {
      const apiErr = ensureApiError(err);
      const friendly = getErrorMessage(apiErr);
      setEditError(friendly);
      setToast({ type: 'error', message: friendly });
      return false;
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      setToast({ type: 'info', message: 'Template deleted.' });
      setDeleteTarget(null);
    } catch (err) {
      const apiErr = ensureApiError(err);
      const friendly = getErrorMessage(apiErr);
      setToast({ type: 'error', message: friendly });
      setDeleteTarget(null);
    }
  }

  const listContent = useMemo(() => {
    if (isLoading) {
      return <SkeletonTable rows={5} columns={5} />;
    }

    if (error) {
      return (
        <ErrorState
          title="Unable to load templates"
          description={error.message}
          code={error.code}
          onRetry={() => refetch()}
        />
      );
    }

    if (templates.length === 0) {
      return (
        <EmptyState
          title="Create your first template"
          description="Curate your best prompts and reuse them with confidence."
          actionLabel="Create template"
          onAction={() => {
            const element = document.getElementById('template-title');
            element?.focus();
          }}
        />
      );
    }

    return (
      <TemplateTable
        templates={templates}
        ordering={ordering}
        onSort={toggleOrdering}
        onEdit={(item) => setSelectedTemplate(item)}
        onDetails={(item) => setDetailsTemplate(item)}
        onDelete={(item) => setDeleteTarget(item)}
        onCopy={handleCopy}
        page={page}
        pageSize={params.pageSize}
        total={total}
        onPageChange={setPage}
      />
    );
  }, [isLoading, error, templates, ordering, params.pageSize, total, page, refetch]);

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem' }}>
        <SkeletonTable rows={5} columns={5} />
      </div>
    );
  }

  if (!isAuthed) {
    return null;
  }

  return (
    <div className="templates-scene">
      <div className="gradient" />

      <header className="page-header">
        <div className="header-card">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/profile" className="breadcrumb-home">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 6L8 2L14 6V13C14 13.2652 13.8946 13.5196 13.7071 13.7071C13.5196 13.8946 13.2652 14 13 14H3C2.73478 14 2.48043 13.8946 2.29289 13.7071C2.10536 13.5196 2 13.2652 2 13V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 14V8H10V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Profile</span>
            </Link>
            <span className="separator">→</span>
            <span className="current" aria-current="page">Templates</span>
          </nav>

          <div className="headline">
            <div className="title-section">
              <div className="title-wrapper">
                <h1>Template Library</h1>
                <div className="title-accent"></div>
              </div>
              <p className="subtitle">Reusable prompts to launch ideas faster. Stay within policy automatically.</p>
            </div>
            <Link href="/profile" className="back-button">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.25 13.5L6.75 9L11.25 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Back to Profile</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="form-column">
          <TemplateForm onSubmit={handleCreate} isSubmitting={create.isPending} errorMessage={formError} />
        </section>
        <section className="list-column">{listContent}</section>
      </main>

      <TemplateEditDialog
        open={Boolean(selectedTemplate)}
        template={selectedTemplate}
        isSubmitting={update.isPending}
        errorMessage={editError}
        onClose={() => {
          setSelectedTemplate(null);
          setEditError(null);
        }}
        onSubmit={handleUpdate}
      />

      <TemplateDetailsDialog
        open={Boolean(detailsTemplate)}
        template={detailsTemplate}
        onClose={() => setDetailsTemplate(null)}
        onCopy={(item) => handleCopy(item)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete template?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <style jsx global>{`
        .breadcrumb-home {
          display: inline-flex !important;
          align-items: center !important;
          gap: 0.4rem !important;
          color: #8B5CF6 !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          padding: 0.4rem 0.6rem !important;
          border-radius: 8px !important;
          transition: all 180ms ease-in-out !important;
          background: rgba(139, 92, 246, 0.06) !important;
          font-size: 0.875rem !important;
          letter-spacing: 0.01em !important;
          border: none !important;
        }

        .breadcrumb-home:hover {
          background: rgba(139, 92, 246, 0.12) !important;
          color: #7C3AED !important;
          text-decoration: none !important;
        }

        .back-button {
          display: inline-flex !important;
          align-items: center !important;
          gap: 0.45rem !important;
          background: rgba(139, 92, 246, 0.08) !important;
          color: #8B5CF6 !important;
          padding: 0.5rem 1rem !important;
          border-radius: 10px !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 0.9rem !important;
          letter-spacing: 0.01em !important;
          border: none !important;
          transition: all 180ms ease-in-out !important;
          white-space: nowrap !important;
        }

        .back-button:hover {
          background: rgba(139, 92, 246, 0.14) !important;
          color: #7C3AED !important;
          transform: translateX(-2px) !important;
          text-decoration: none !important;
        }
      `}</style>

      <style jsx>{`
        .templates-scene {
          position: relative;
          padding: ${TemplateSpacing.xl} clamp(1.5rem, 5vw, 4rem);
          background: ${TemplateColors.bgWarm};
          min-height: 100vh;
        }

        .gradient {
          position: absolute;
          inset: 0;
          background: ${TemplateGradients.subtle};
          opacity: 0.8;
          z-index: 0;
        }

        .page-header,
        .layout,
        .toast {
          position: relative;
          z-index: 1;
        }

        .page-header {
          margin-bottom: clamp(1.5rem, 3vh, 2.5rem);
        }

        .header-card {
          background: ${TemplateColors.surface};
          border-radius: ${TemplateRadius.xl};
          padding: clamp(1.5rem, 3vw, 2.5rem);
          box-shadow: 0 4px 24px rgba(255, 143, 171, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04);
          border: 1px solid rgba(255, 182, 141, 0.15);
          backdrop-filter: blur(10px);
          display: grid;
          gap: clamp(1.5rem, 2.5vw, 2rem);
          margin-bottom: 0;
          animation: slideDown 0.5s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: ${TemplateSpacing.sm};
          font-size: clamp(0.85rem, 1vw, 0.9rem);
          color: ${TemplateColors.textMuted};
        }

        .breadcrumb-home svg {
          transition: transform ${TemplateTransitions.base};
        }

        .breadcrumb-home:hover svg {
          transform: rotate(-10deg) scale(1.15);
        }

        .breadcrumb-home:active {
          transform: translateY(0);
        }

        .separator {
          color: ${TemplateColors.textMuted};
          font-weight: 400;
          opacity: 0.6;
        }

        .current {
          color: ${TemplateColors.textSecondary};
          font-weight: 600;
          padding: 0.4rem 0.8rem;
          background: ${TemplateGradients.pillActive};
          border-radius: ${TemplateRadius.md};
        }

        .headline {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: clamp(1.5rem, 3vw, 2rem);
          flex-wrap: wrap;
        }

        .title-section {
          flex: 1;
          min-width: 280px;
        }

        .title-wrapper {
          position: relative;
          display: inline-block;
          margin-bottom: ${TemplateSpacing.sm};
        }

        .title-wrapper h1 {
          margin: 0;
          font-family: ${TemplateTypography.display};
          font-size: clamp(1.8rem, 3.5vw, 2.6rem);
          font-weight: 700;
          background: linear-gradient(135deg, #FF6B9D 0%, #FFA06B 50%, #8B5CF6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.02em;
          line-height: 1.2;
          position: relative;
        }

        .title-accent {
          position: absolute;
          bottom: -8px;
          left: 0;
          width: clamp(80px, 30%, 160px);
          height: 4px;
          background: ${TemplateGradients.primary};
          border-radius: ${TemplateRadius.full};
          opacity: 0.6;
          animation: expandWidth 0.8s ease-out 0.3s both;
        }

        @keyframes expandWidth {
          from {
            width: 0;
            opacity: 0;
          }
          to {
            width: clamp(80px, 30%, 160px);
            opacity: 0.6;
          }
        }

        .subtitle {
          margin: ${TemplateSpacing.md} 0 0;
          color: ${TemplateColors.textSecondary};
          font-size: clamp(1rem, 1.3vw, 1.15rem);
          font-weight: 500;
          line-height: 1.6;
          letter-spacing: 0.01em;
          max-width: 540px;
        }

        .back-button svg {
          transition: transform ${TemplateTransitions.base};
        }

        .back-button:hover svg {
          transform: translateX(-4px);
        }

        .back-button:active {
          transform: translateY(0);
        }

        .layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(1.5rem, 3vh, 2.5rem);
          max-width: none;
          margin: 0;
          width: 100%;
        }

        .form-column,
        .list-column {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        .toast {
          position: fixed;
          top: ${TemplateSpacing.lg};
          right: ${TemplateSpacing.lg};
          padding: ${TemplateSpacing.sm} ${TemplateSpacing.md};
          border-radius: ${TemplateRadius.lg};
          background: ${TemplateColors.surface};
          box-shadow: ${TemplateShadows.card};
          font-weight: 600;
        }

        .toast.success {
          border-left: 4px solid ${TemplateColors.success};
        }

        .toast.error {
          border-left: 4px solid ${TemplateColors.danger};
        }

        .toast.info {
          border-left: 4px solid ${TemplateColors.textAccent};
        }

        @media (max-width: 1024px) {
          .layout {
            grid-template-columns: 1fr;
            max-width: 760px;
          }

          .toast {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
          }
        }

        @media (max-width: 768px) {
          .header-card {
            padding: ${TemplateSpacing.lg};
          }

          .headline {
            flex-direction: column;
            align-items: stretch;
            gap: ${TemplateSpacing.lg};
          }

          .title-section {
            min-width: 100%;
          }

          .back-button {
            width: 100%;
            justify-content: center;
          }

          .breadcrumb {
            flex-wrap: wrap;
          }
        }

        @media (max-width: 640px) {
          .templates-scene {
            padding: ${TemplateSpacing.lg};
          }

          .header-card {
            padding: ${TemplateSpacing.md};
          }

          .title-wrapper h1 {
            font-size: 1.6rem;
          }

          .subtitle {
            font-size: 0.9rem;
          }

          .back-button {
            font-size: 0.85rem;
            padding: 0.65rem 1rem;
          }

          .back-button svg {
            width: 14px;
            height: 14px;
          }
        }
      `}</style>
    </div>
  );
}
