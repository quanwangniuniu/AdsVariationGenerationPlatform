"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import GradientButton from "@/components/billing/GradientButton";
import { listAdVariants, listWorkspaceAdVariants, AdVariant } from "@/api/advariants";
import { getCreative, Creative } from "@/api/creatives";
import { redirectToAuthWithNext, verifySession } from "@/lib/authHelpers";

const PAGE_SIZE = 12;
const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "processing", label: "Processing" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
];

const statusColors: Record<string, { bg: string; text: string }> = {
  completed: { bg: "#DCFCE7", text: "#166534" },
  processing: { bg: "#FEF3C7", text: "#92400E" },
  pending: { bg: "#E0E7FF", text: "#3730A3" },
  failed: { bg: "#FEE2E2", text: "#B91C1C" },
  default: { bg: "#E5E7EB", text: "#374151" },
};

export type LibraryViewProps = {
  workspaceId?: string;
};

function buildAiChatPath(adId: string, workspaceId?: string) {
  const encoded = encodeURIComponent(adId);
  if (workspaceId) {
    return `/workspaces/${workspaceId}/ai_chat?ad_id=${encoded}`;
  }
  return `/ai_chat?ad_id=${encoded}`;
}

function resolveAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.sessionStorage.getItem("authToken") ??
    window.localStorage.getItem("authToken") ??
    null
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(date);
}

export default function LibraryView({ workspaceId }: LibraryViewProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(
    null,
  );
  const [refreshTick, setRefreshTick] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<AdVariant | null>(null);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(
    null,
  );

  const workspaceHomePath = workspaceId ? `/workspaces/${workspaceId}` : "/";
  const workspaceLabel = workspaceId ? (workspaceName ?? "Workspace") : "Home";
  const aiChatBasePath = workspaceId ? `/workspaces/${workspaceId}/ai_chat` : "/ai_chat";

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / PAGE_SIZE)),
    [count],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const authed = await verifySession();
        if (!active) return;
        if (!authed) {
          setIsAuthed(false);
          redirectToAuthWithNext();
        } else {
          setIsAuthed(true);
        }
      } catch {
        if (!active) return;
        setIsAuthed(false);
        redirectToAuthWithNext();
      } finally {
        if (active) setAuthChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`Failed to load workspace ${workspaceId}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setWorkspaceName(data?.name || workspaceId);
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceName(workspaceId);
        }
        console.error("Failed to fetch workspace info:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!authChecked || !isAuthed) return;
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = resolveAuthToken();
        const payload = workspaceId
          ? await listWorkspaceAdVariants(workspaceId, token, {
              page,
              pageSize: PAGE_SIZE,
              status: statusFilter === "all" ? undefined : statusFilter,
              search: searchQuery || undefined,
              ordering: "-generation_requested_at",
            })
          : await listAdVariants(token, {
              page,
              pageSize: PAGE_SIZE,
              status: statusFilter === "all" ? undefined : statusFilter,
              search: searchQuery || undefined,
              ordering: "-generation_requested_at",
            });
        if (!active) return;
        setVariants(payload.results ?? []);
        setCount(payload.count ?? 0);
      } catch (err: any) {
        if (!active) return;
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load variants.";
        const code =
          typeof err?.response?.data?.code === "string"
            ? err.response.data.code
            : undefined;
        setError({ message, code });
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [authChecked, isAuthed, page, statusFilter, searchQuery, refreshTick, workspaceId]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchDraft.trim());
  };

  const handleChangeTab = (nextTab: string) => {
    if (statusFilter === nextTab) return;
    setStatusFilter(nextTab);
    setPage(1);
  };

  const handleRefresh = () => {
    setPage(1);
    setRefreshTick((tick) => tick + 1);
  };

  const handleViewVariant = (variant: AdVariant) => {
    router.push(buildAiChatPath(variant.original_ad, workspaceId));
  };

  const handleViewOriginal = async (variant: AdVariant) => {
    setSelectedVariant(variant);
    setSelectedCreative(null);
    setModalError(null);
    setIsModalOpen(true);
    setModalLoading(true);
    try {
      const token = resolveAuthToken();
      const creative = await getCreative(token, variant.original_ad);
      setSelectedCreative(creative);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to load original ad.";
      setModalError(message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedVariant(null);
    setSelectedCreative(null);
    setModalError(null);
  };

  const renderStatus = (status: AdVariant["generation_status"]) => {
    const palette = statusColors[status] ?? statusColors.default;
    return (
      <span
        className="variant-status"
        style={{ backgroundColor: palette.bg, color: palette.text }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderConfidence = (value: number | null) => {
    if (value === null || value === undefined) return "—";
    return `${Math.round(value * 100)}%`;
  };

  if (!authChecked) {
    return (
      <>
        <Navbar workspaceId={workspaceId} workspaceName={workspaceName} />
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
        <style jsx>{`
          .library-loading {
            min-height: 80vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff7f2;
          }
          .library-spinner {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: 6px solid rgba(236, 72, 153, 0.25);
            border-top-color: rgba(236, 72, 153, 0.75);
            animation: spin 0.9s linear infinite;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </>
    );
  }

  if (!isAuthed) {
    return null;
  }

  return (
      <>
        <Navbar workspaceId={workspaceId} workspaceName={workspaceName} />
        <main className="library-page">
        <header className="library-hero">
          <div className="library-headline">
            <div>
              <h1>Creative Library</h1>
              <p>
                Explore every variant generated by your team. Filter, review,
                and relaunch the winners in a single warm workspace.
              </p>
            </div>
            {/* {!workspaceId && (
              <GradientButton
                variant="secondary"
                size="sm"
                onClick={() => router.push("/")}
              >
                Back to dashboard
              </GradientButton>
            )} */}
          </div>
        </header>

        <section className="library-toolbar">
          <nav className="library-tabs" aria-label="Variant status filters">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`library-tab ${active ? "active" : ""}`}
                  onClick={() => handleChangeTab(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <form className="library-search" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              placeholder="Search by variant title, original ad, or platform"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
            <GradientButton type="submit" size="sm">
              Search
            </GradientButton>
            <button
              type="button"
              className="library-refresh"
              onClick={handleRefresh}
            >
              Refresh
            </button>
          </form>
        </section>

        <section className="library-content">
          {isLoading ? (
            <LibrarySkeleton />
          ) : error ? (
            <ErrorState
              title="We could not load your variants."
              description={error.message}
              code={error.code}
              onRetry={() => handleRefresh()}
            />
          ) : variants.length === 0 ? (
            <EmptyState
              title="No variants yet"
              description="Generate your first creative variant from the Create Ads workspace. They will appear here for easy reuse."
              actionLabel="Open Create Ads"
              onAction={() => router.push(aiChatBasePath)}
            />
          ) : (
            <>
              <div className="variant-grid">
                {variants.map((variant) => (
                  <article key={variant.id} className="variant-card-shell">
                    <div className="variant-figure">
                      {variant.variant_image_url ? (
                        <img
                          src={variant.variant_image_url}
                          alt={variant.variant_title}
                          loading="lazy"
                        />
                      ) : (
                        <div className="variant-placeholder">
                          <span>No preview</span>
                        </div>
                      )}
                      <div className="variant-status-wrap">
                        {renderStatus(variant.generation_status)}
                      </div>
                    </div>
                    <div className="variant-body">
                      <h3 title={variant.variant_title}>
                        {variant.variant_title || "Untitled variant"}
                      </h3>
                      <p className="variant-meta">
                        Original: {variant.original_ad_title || "Unknown"} ·{" "}
                        {formatDate(variant.generation_requested_at)}
                      </p>
                      <p className="variant-description">
                        {variant.variant_description || "No description yet."}
                      </p>
                      <dl className="variant-summary">
                        <div>
                          <dt>Confidence</dt>
                          <dd>{renderConfidence(variant.confidence_score)}</dd>
                        </div>
                        <div>
                          <dt>Agent</dt>
                          <dd>{variant.ai_agent_platform || "—"}</dd>
                        </div>
                        <div>
                          <dt>Duration</dt>
                          <dd>
                            {variant.generation_duration
                              ? `${Math.round(
                                  variant.generation_duration,
                                )}s`
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                      <div className="variant-actions">
                        <GradientButton
                          size="sm"
                          onClick={() => handleViewVariant(variant)}
                        >
                          Use in Create Ads
                        </GradientButton>
                        <button
                          type="button"
                          className="variant-secondary"
                          onClick={() => handleViewOriginal(variant)}
                        >
                          View original
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <footer className="library-pagination">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </footer>
            </>
          )}
        </section>
      </main>

      {isModalOpen && (
        <div className="library-modal-backdrop" role="dialog" aria-modal="true">
          <div className="library-modal-card">
            <button
              type="button"
              className="library-modal-close"
              onClick={handleCloseModal}
              aria-label="Close dialog"
            >
              ×
            </button>
            {modalLoading ? (
              <div className="library-modal-loading">
                <div className="library-spinner small" />
                <p>Loading original ad…</p>
              </div>
            ) : modalError ? (
              <ErrorState
                title="Unable to load the original ad"
                description={modalError}
                onRetry={() => selectedVariant && handleViewOriginal(selectedVariant)}
              />
            ) : (
              selectedVariant &&
              selectedCreative && (
                <div className="library-modal-content">
                  <header>
                    <span className="modal-kicker">Original Ad</span>
                    <h2>{selectedCreative.creative_title || selectedCreative.title || "Untitled ad"}</h2>
                    <p>
                      Advertiser: {selectedCreative.advertiser_name || "Unknown"} · Format:{" "}
                      {selectedCreative.format?.toUpperCase() || "—"} · Platform:{" "}
                      {selectedCreative.platform || "—"}
                    </p>
                  </header>
                  <section className="modal-body">
                    <figure>
                      {selectedCreative.image_url ? (
                        <img
                          src={selectedCreative.image_url}
                          alt={selectedCreative.creative_title || "Original advertisement"}
                          loading="lazy"
                        />
                      ) : (
                        <div className="modal-image-placeholder">No preview available</div>
                      )}
                    </figure>
                    <dl>
                      <div>
                        <dt>Original ad ID</dt>
                        <dd>{selectedCreative.ad_creative_id}</dd>
                      </div>
                      <div>
                        <dt>Target domain</dt>
                        <dd>{selectedCreative.target_domain || "—"}</dd>
                      </div>
                      <div>
                        <dt>First shown</dt>
                        <dd>{formatDate(selectedCreative.first_shown)}</dd>
                      </div>
                      <div>
                        <dt>Last shown</dt>
                        <dd>{formatDate(selectedCreative.last_shown)}</dd>
                      </div>
                      <div>
                        <dt>Region</dt>
                        <dd>{selectedCreative.region || "—"}</dd>
                      </div>
                    </dl>
                  </section>
                  <footer className="modal-actions">
                    <button
                      type="button"
                      className="variant-secondary"
                      onClick={() =>
                        selectedCreative.details_link &&
                        window.open(selectedCreative.details_link, "_blank", "noopener")
                      }
                      disabled={!selectedCreative.details_link}
                    >
                      View details page
                    </button>
                  </footer>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .library-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
          font-family: "Inter", sans-serif;
          color: #1f2937;
          padding-bottom: 64px;
        }

        .library-hero {
          max-width: 1200px;
          margin: 0 auto;
          padding: 48px 24px 32px;
        }

        .library-breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #78716c;
          font-size: 0.9rem;
          margin-bottom: 20px;
        }

        .breadcrumb-link {
          background: none;
          border: none;
          color: inherit;
          font: inherit;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .breadcrumb-link:hover {
          color: #ec4899;
        }

        .breadcrumb-separator {
          font-size: 1rem;
        }

        .breadcrumb-current {
          font-weight: 600;
        }

        .library-headline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .library-headline h1 {
          font-family: "Playfair Display", serif;
          font-size: clamp(2rem, 3vw, 2.8rem);
          font-weight: 600;
          margin: 0 0 12px;
          background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .library-headline p {
          color: #6b7280;
          font-size: 1rem;
          margin: 0;
          max-width: 620px;
        }

        .library-toolbar {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .library-tabs {
          display: flex;
          gap: 12px;
          padding: 8px;
          background: #f9f5ff;
          border-radius: 999px;
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.1),
            0 4px 12px rgba(0, 0, 0, 0.03);
          overflow-x: auto;
        }

        .library-tab {
          border: none;
          border-radius: 999px;
          padding: 10px 18px;
          background: transparent;
          color: #6b7280;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.95rem;
        }

        .library-tab:hover {
          color: #ec4899;
        }

        .library-tab.active {
          background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
          color: #fff;
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.2),
            0 8px 24px rgba(255, 184, 107, 0.2);
        }

        .library-search {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }

        .library-search input[type="search"] {
          flex: 1;
          min-width: 240px;
          padding: 12px 16px;
          border-radius: 16px;
          border: 2px solid rgba(249, 168, 212, 0.45);
          background: rgba(255, 255, 255, 0.95);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .library-search input[type="search"]:focus {
          outline: none;
          border-color: #ec4899;
          box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.18);
        }

        .library-refresh {
          border: 2px solid rgba(236, 72, 153, 0.35);
          background: transparent;
          color: #ec4899;
          border-radius: 12px;
          padding: 10px 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
        }

        .library-refresh:hover {
          background: rgba(236, 72, 153, 0.1);
          transform: translateY(-1px);
        }

        .library-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px 48px;
        }

        .variant-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
        }

        .variant-card-shell {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 24px;
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15),
            0 4px 12px rgba(0, 0, 0, 0.03);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }

        .variant-card-shell:hover {
          transform: translateY(-6px);
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.18),
            0 8px 24px rgba(255, 184, 107, 0.2);
        }

        .variant-figure {
          position: relative;
          width: 100%;
          padding-top: 62%;
          background: rgba(255, 247, 242, 0.85);
          overflow: hidden;
        }

        .variant-figure img,
        .variant-placeholder {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .variant-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          font-size: 0.9rem;
        }

        .variant-status-wrap {
          position: absolute;
          top: 16px;
          left: 16px;
        }

        .variant-status {
          display: inline-flex;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .variant-body {
          padding: 20px 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .variant-body h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #1f2937;
        }

        .variant-meta {
          color: #6b7280;
          font-size: 0.85rem;
          margin: 0;
        }

        .variant-description {
          color: #4b5563;
          font-size: 0.9rem;
          line-height: 1.5;
          margin: 0;
        }

        .variant-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 8px 0 0;
        }

        .variant-summary dt {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #9ca3af;
          margin: 0 0 4px;
          letter-spacing: 0.04em;
        }

        .variant-summary dd {
          margin: 0;
          font-weight: 600;
          color: #1f2937;
        }

        .variant-actions {
          margin-top: 12px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .variant-secondary {
          border: 2px solid rgba(236, 72, 153, 0.35);
          border-radius: 999px;
          padding: 10px 18px;
          background: transparent;
          color: #ec4899;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .variant-secondary:hover {
          background: rgba(236, 72, 153, 0.1);
        }

        .library-pagination {
          margin-top: 32px;
          display: flex;
          justify-content: center;
          gap: 16px;
          align-items: center;
        }

        .library-pagination button {
          border: 2px solid rgba(236, 72, 153, 0.35);
          background: transparent;
          color: #ec4899;
          font-weight: 600;
          border-radius: 999px;
          padding: 10px 18px;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .library-pagination button:hover:not(:disabled) {
          background: rgba(236, 72, 153, 0.1);
        }

        .library-pagination button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .library-pagination span {
          color: #6b7280;
          font-weight: 500;
        }

        .library-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1000;
        }

        .library-modal-card {
          position: relative;
          width: min(720px, 100%);
          background: rgba(255, 255, 255, 0.98);
          border-radius: 28px;
          box-shadow: 0 25px 55px rgba(255, 138, 171, 0.2),
            0 12px 32px rgba(0, 0, 0, 0.08);
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .library-modal-close {
          position: absolute;
          top: 18px;
          right: 18px;
          border: none;
          background: rgba(253, 242, 248, 0.95);
          border-radius: 999px;
          width: 36px;
          height: 36px;
          font-size: 1.2rem;
          font-weight: 600;
          cursor: pointer;
          line-height: 1;
        }

        .library-modal-close:hover {
          background: rgba(236, 72, 153, 0.12);
        }

        .library-modal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: #6b7280;
        }

        .library-spinner.small {
          width: 40px;
          height: 40px;
          border-width: 5px;
        }

        .library-modal-content header h2 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 600;
          font-family: "Playfair Display", serif;
          color: #1f2937;
        }

        .library-modal-content header p {
          margin: 6px 0 0;
          color: #6b7280;
          font-size: 0.95rem;
        }

        .modal-kicker {
          display: inline-block;
          margin-bottom: 8px;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #a855f7;
          font-weight: 600;
        }

        .modal-body {
          display: grid;
          gap: 20px;
          grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
          align-items: flex-start;
        }

        .modal-body figure {
          margin: 0;
          border-radius: 20px;
          overflow: hidden;
          min-height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 247, 242, 0.9);
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.18),
            0 6px 18px rgba(0, 0, 0, 0.12);
        }

        .modal-body img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .modal-image-placeholder {
          padding: 32px;
          color: #9ca3af;
          font-weight: 500;
        }

        .modal-body dl {
          margin: 0;
          display: grid;
          gap: 16px;
        }

        .modal-body dt {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #9ca3af;
          margin-bottom: 4px;
        }

        .modal-body dd {
          margin: 0;
          font-weight: 600;
          color: #1f2937;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        @media (max-width: 1024px) {
          .library-headline {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 768px) {
          .library-search {
            flex-direction: column;
            align-items: stretch;
          }

          .variant-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .modal-body {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .variant-summary {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}

function LibrarySkeleton() {
  return (
    <div className="library-skeleton-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="library-skeleton-card">
          <div className="skeleton-image" />
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-footer" />
        </div>
      ))}
      <style jsx>{`
        .library-skeleton-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }

        .library-skeleton-card {
          background: rgba(255, 255, 255, 0.9);
          border-radius: 24px;
          padding: 18px 20px 24px;
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.12),
            0 4px 12px rgba(0, 0, 0, 0.03);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .skeleton-image {
          width: 100%;
          padding-top: 60%;
          border-radius: 18px;
          background: linear-gradient(
            120deg,
            rgba(249, 168, 212, 0.3) 0%,
            rgba(255, 255, 255, 0.4) 40%,
            rgba(249, 168, 212, 0.3) 80%
          );
          background-size: 200% 200%;
          animation: shimmer 1.6s ease-in-out infinite;
        }

        .skeleton-line {
          height: 12px;
          border-radius: 8px;
          background: linear-gradient(
            120deg,
            rgba(255, 212, 229, 0.4) 0%,
            rgba(255, 255, 255, 0.6) 40%,
            rgba(255, 212, 229, 0.4) 80%
          );
          background-size: 200% 200%;
          animation: shimmer 1.6s ease-in-out infinite;
        }

        .skeleton-line.short {
          width: 60%;
        }

        .skeleton-footer {
          height: 36px;
          border-radius: 999px;
          background: linear-gradient(
            120deg,
            rgba(249, 168, 212, 0.3) 0%,
            rgba(255, 255, 255, 0.5) 40%,
            rgba(249, 168, 212, 0.3) 80%
          );
          background-size: 200% 200%;
          animation: shimmer 1.6s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }
      `}</style>
    </div>
  );
}

