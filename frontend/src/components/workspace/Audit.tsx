// components/workspace/Audit.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';

type Workspace = {
  id: string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  type?: 'standard' | 'demo' | 'enterprise';
};

type InviteUsage = {
  id: string;
  user_email?: string | null;
  ip_address?: string | null;  // Backend returns 'ip_address', not 'ip'
  user_agent?: string | null;
  status: 'success' | 'failed' | 'expired' | 'deactivated' | 'link_invalid' | 'already_member' | 'permission_denied' | 'workspace_full' | 'error';
  assigned_role?: string;  // Backend returns 'assigned_role', not 'role'
  joined_at: string;  // Backend returns 'joined_at', not 'created_at'
  invitation_link_name?: string | null;  // Backend returns 'invitation_link_name', not 'invitation_name'
  // Optional: if backend returns "creator", for "only show my created" filter
  created_by_id?: string | number | null;
  created_by_username?: string | null;
};

type WorkspaceStats = {
  workspace?: {
    id: string;
    name: string;
  };
  period?: {
    date_from?: string;
    date_to?: string;
  };
  summary?: {
    total_attempts: number;
    successful_joins: number;
    failed_attempts: number;
    success_rate: number;          // 0~1 or 0~100, handled with tolerance below
    recent_joins_30d: number;
  };
  breakdown?: {
    by_status: Record<string, number>;
    by_role: Record<string, number>;
  };
  top_invitation_links?: Array<{ 
    invitation_link__name: string; 
    usage_count: number; 
    success_count: number 
  }>;
};

interface AuditProps {
  ws: Workspace | null;
  usage: InviteUsage[];
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onRefreshUsage: (wid: string) => Promise<void>;
  /** Optional: current user id, for "only show my created" filter */
  currentUserId?: string | number;
  /** Optional: GET caller; if not provided, component will use internal fetch */
  onApiGet?: <T>(url: string) => Promise<T | null>;
}

export default function Audit({ ws, usage, onShowMsg, onRefreshUsage, currentUserId, onApiGet }: AuditProps) {
  const [auditSearch, setAuditSearch] = useState('');
  const [auditStatusFilter, setAuditStatusFilter] = useState<'all' | InviteUsage['status']>('all');
  const [auditRoleFilter, setAuditRoleFilter] = useState<'all' | 'admin' | 'member' | 'viewer'>('all');
  const [onlyMine, setOnlyMine] = useState(false);

  const hasCreatedBy = useMemo(
    () => usage.some(u => u.created_by_id != null || u.created_by_username != null),
    [usage]
  );

  const filteredUsage = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return (usage || [])
      .filter(u => (auditStatusFilter === 'all' ? true : u.status === auditStatusFilter))
      .filter(u => (auditRoleFilter === 'all' ? true : (u.assigned_role || '') === auditRoleFilter))
      .filter(u => {
        if (onlyMine && hasCreatedBy && currentUserId != null) {
          if (String(u.created_by_id ?? '') !== String(currentUserId)) return false;
        }
        return true;
      })
      .filter(u => {
        if (!q) return true;
        const hay = [
          u.user_email || '',
          u.ip_address || '',
          u.user_agent || '',
          u.status || '',
          u.assigned_role || '',
          u.invitation_link_name || '',
          u.joined_at || '',
          u.created_by_username || '',
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()));
  }, [usage, auditSearch, auditStatusFilter, auditRoleFilter, onlyMine, hasCreatedBy, currentUserId]);

  /** ---------- Load workspace_stats ---------- */
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  async function fetchStats() {
    if (!ws) return;
    try {
      setLoadingStats(true);
      let data: WorkspaceStats | null = null;
      if (onApiGet) {
        data = await onApiGet<WorkspaceStats>(`/api/workspaces/${ws.id}/invitation-usage/workspace_stats/`);
      } else {
        const r = await fetch(`/api/workspaces/${ws.id}/invitation-usage/workspace_stats/`, { credentials: 'include', cache: 'no-store' });
        data = r.ok ? (await r.json()) as WorkspaceStats : null;
      }
      if (data) setStats(data);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    setStats(null);
    if (ws) fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  /** ---------- KPI (compatible with backend success_rate as 0~1 or 0~100) ---------- */
  const kpi = useMemo(() => {
    if (!stats || !stats.summary) return { total: 0, success: 0, successRate: 0, last30d: 0 };
    const summary = stats.summary;
    const sr = summary.success_rate > 1 ? summary.success_rate : Math.round(summary.success_rate * 100);
    return {
      total: summary.total_attempts,
      success: summary.successful_joins,
      successRate: Math.round(sr),
      last30d: summary.recent_joins_30d,
    };
  }, [stats]);

  function exportCSV() {
    const rows = [
      ['joined_at', 'email', 'ip_address', 'user_agent', 'status', 'assigned_role', 'invitation_link_name', 'created_by'],
      ...filteredUsage.map(u => [
        new Date(u.joined_at).toISOString(),
        u.user_email ?? '',
        u.ip_address ?? '',
        (u.user_agent ?? '').replaceAll(',', ' '),
        u.status,
        u.assigned_role ?? '',
        (u.invitation_link_name ?? '').replaceAll(',', ' '),
        u.created_by_username ?? '',
      ])
    ];
    const csv = rows.map(r => r.map(f => `"${String(f).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invitation-usage-${ws?.name || 'workspace'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowMsg('CSV exported', 'success');
  }

  async function refreshAudit() {
    if (!ws) return;
    await onRefreshUsage(ws.id);
    await fetchStats();
    onShowMsg('Audit refreshed', 'success');
  }

  /** ---------- Render ---------- */
  return (
    <>
      <header className="page-header">
        <h1>Invitation Usage</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      {/* KPI + Status/Role breakdown (from workspace_stats) */}
      <section className="card">
        <div className="kpi-grid">
          <div className="kpi-box">
            <div className="kpi-title">Total Attempts</div>
            <div className="kpi-value">{kpi.total}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-title">Successful Joins</div>
            <div className="kpi-value">{kpi.success}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-title">Success Rate</div>
            <div className="kpi-value">{kpi.successRate}%</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-title">Last 30 days</div>
            <div className="kpi-value">{kpi.last30d}</div>
          </div>
        </div>

        <div className="split">
          {/* Status distribution */}
          <div className="block">
            <div className="block-title">By Status</div>
            {loadingStats && <div className="muted">Loading…</div>}
            {!loadingStats && (!stats || !stats.breakdown || Object.keys(stats.breakdown.by_status || {}).length === 0) && <div className="muted">No data</div>}
            {!loadingStats && stats && stats.breakdown && Object.entries(stats.breakdown.by_status).map(([label, count]) => (
              <div key={label} className="bar-row">
                <span className="bar-label">{label}</span>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${Math.min(100, (count / Math.max(1, kpi.total)) * 100)}%` }} />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
          </div>

          {/* Role distribution */}
          <div className="block">
            <div className="block-title">By Role</div>
            {loadingStats && <div className="muted">Loading…</div>}
            {!loadingStats && (!stats || !stats.breakdown || Object.keys(stats.breakdown.by_role || {}).length === 0) && <div className="muted">No data</div>}
            {!loadingStats && stats && stats.breakdown && Object.entries(stats.breakdown.by_role).map(([label, count]) => (
              <div key={label} className="bar-row">
                <span className="bar-label">{label}</span>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${Math.min(100, (count / Math.max(1, kpi.total)) * 100)}%` }} />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
          </div>

          {/* Top Links */}
          <div className="block">
            <div className="block-title">Top Links</div>
            {loadingStats && <div className="muted">Loading…</div>}
            {!loadingStats && (!stats || (stats.top_invitation_links || []).length === 0) && <div className="muted">No data</div>}
            {!loadingStats && stats && stats.top_invitation_links?.slice(0, 6).map((x, idx) => (
              <div key={idx} className="top-row">
                <div className="top-name cut">{x.invitation_link__name}</div>
                <div className="top-badges">
                  <span className="chip">Uses: <b>{x.usage_count}</b></span>
                  <span className="chip">Success: <b>{x.success_count}</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Filters</h3>
          <div className="row-end">
            <button className="ghost" onClick={exportCSV} disabled={filteredUsage.length === 0}>Export CSV</button>
            <button className="ghost" onClick={refreshAudit}>Refresh</button>
          </div>
        </div>

        <div className="grid3">
          <input
            className="input"
            placeholder="Search email/IP/UA/status/creator…"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
          />
          <select
            className="input"
            value={auditStatusFilter}
            onChange={(e) => setAuditStatusFilter(e.target.value as any)}
          >
            <option value="all">All status</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="expired">expired</option>
            <option value="deactivated">deactivated</option>
            <option value="link_invalid">link_invalid</option>
            <option value="already_member">already_member</option>
            <option value="permission_denied">permission_denied</option>
            <option value="workspace_full">workspace_full</option>
            <option value="error">error</option>
          </select>
          <select
            className="input"
            value={auditRoleFilter}
            onChange={(e) => setAuditRoleFilter(e.target.value as any)}
          >
            <option value="all">All roles</option>
            <option value="viewer">viewer</option>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </div>

        {hasCreatedBy && currentUserId != null && (
          <div className="row" style={{ marginTop: 8 }}>
            <label className="toggle">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              <span>Only show my invitations' usage</span>
            </label>
          </div>
        )}
      </section>

      {/* Table */}
      <section className="card">
        {filteredUsage.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <p>No usage records.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Email</th>
                <th>IP</th>
                <th>UA</th>
                <th>Status</th>
                <th>Role</th>
                <th>Invitation</th>
                {hasCreatedBy && <th>Creator</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUsage.map(u => (
                <tr key={u.id}>
                  <td>{new Date(u.joined_at).toLocaleString()}</td>
                  <td>{u.user_email || '—'}</td>
                  <td className="mono">{u.ip_address || '—'}</td>
                  <td className="cut">{u.user_agent || '—'}</td>
                  <td>{u.status}</td>
                  <td>{u.assigned_role || '—'}</td>
                  <td className="cut">{u.invitation_link_name || '—'}</td>
                  {hasCreatedBy && <td className="cut">{u.created_by_username || String(u.created_by_id ?? '—')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
        .row-end { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
        .row { display:flex; gap:8px; align-items:center; }
        .toggle { display:flex; gap:8px; align-items:center; color:#6b7280; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; }
        .grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        @media (max-width: 900px) { .grid3 { grid-template-columns:1fr; } }
        .muted { color:#6b7280; font-size:12px; }

        .table { width:100%; border-collapse:separate; border-spacing:0; }
        .table th, .table td { text-align:left; padding:10px 8px; border-bottom: 1px dashed #e9d5ff; vertical-align: middle; }
        .table th { font-size:12px; color:#6b7280; font-weight:600; }

        /* KPI + breakdown */
        .kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; }
        @media (max-width: 900px) { .kpi-grid { grid-template-columns: 1fr 1fr; } }
        .kpi-box { background:#fff; border:2px solid #f3e8ff; border-radius:12px; padding:12px; }
        .kpi-title { font-size:12px; color:#7c3aed; font-weight:800; letter-spacing:.02em; }
        .kpi-value { font-size:22px; font-weight:900; margin-top:6px; }

        .split { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px; margin-top: 12px; }
        @media (max-width: 1100px) { .split { grid-template-columns: 1fr; } }

        .block { background:#fff; border:2px solid #f3e8ff; border-radius:12px; padding:12px; }
        .block-title { font-size:12px; color:#7c3aed; font-weight:800; margin-bottom:8px; }

        .bar-row { display:grid; grid-template-columns: 120px 1fr auto; gap:8px; align-items:center; margin:6px 0; }
        .bar-label { color:#6b7280; font-size:12px; }
        .bar { height:12px; border-radius:999px; background:#f3e8ff; overflow:hidden; }
        .bar-fill { height:100%; background: linear-gradient(90deg, #c084fc, #f9a8d4); }
        .bar-count { font-weight:800; color:#374151; }

        .top-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px dashed #f1e8ff; }
        .top-name { font-weight:700; }
        .chip { padding:6px 10px; border-radius:999px; border:2px solid #f3e8ff; background:#fff; font-size:12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }
        .cut { max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      `}</style>
    </>
  );
}
