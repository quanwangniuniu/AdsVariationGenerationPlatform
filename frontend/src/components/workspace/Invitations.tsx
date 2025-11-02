// components/workspace/Invitations.tsx
'use client';

import { useState, useMemo } from 'react';

type Workspace = {
  id: string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  type?: 'standard' | 'demo' | 'enterprise';
};

type Invitation = {
  id: string;
  token: string;
  role: 'admin' | 'member' | 'viewer';
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;  // Backend returns 'is_active', not 'active'
  created_at?: string;
  name?: string | null;
  description?: string | null;
  is_expired?: boolean;
  is_usage_exceeded?: boolean;
  is_valid?: boolean;
  remaining_uses?: number | null;
  invitation_url?: string | null;
  url?: string | null;
  // Optional: for "only show my created" filter; if backend doesn't return, frontend will hide the filter
  created_by_id?: string | number | null;
  created_by_username?: string | null;
};

interface InvitationsProps {
  ws: Workspace | null;
  invites: Invitation[];
  canManageInvites: boolean;
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onApiSend: <T>(url: string, method: string, body?: any, contentType?: string) => Promise<T | null>;
  onRefreshInvites: (wid: string) => Promise<void>;
  /** 可选：限制可创建/编辑的角色（缺省展示全部） */
  allowedInviteRoles?: Array<Invitation['role']>;
  /** 可选：当前用户 id，用于“仅看我创建的”过滤 */
  currentUserId?: string | number;
}

export default function Invitations({
  ws,
  invites,
  canManageInvites,
  onShowMsg,
  onApiSend,
  onRefreshInvites,
  allowedInviteRoles = ['viewer', 'member', 'admin'],
  currentUserId,
}: InvitationsProps) {
  /** ---------- Create ---------- */
  const [inviteForm, setInviteForm] = useState<{
    role: Invitation['role'];
    expires_days?: number;
    max_uses?: number;
    name?: string;
    description?: string;
  }>({ role: (allowedInviteRoles.includes('member') ? 'member' : allowedInviteRoles[0]) as Invitation['role'] });

  /** ---------- Filters ---------- */
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteRoleFilter, setInviteRoleFilter] = useState<'all' | 'admin' | 'member' | 'viewer'>('all');
  const [inviteStatusFilter, setInviteStatusFilter] = useState<'all' | 'active' | 'expired' | 'inactive' | 'exceeded'>('all');
  const [onlyMine, setOnlyMine] = useState(false);

  /** ---------- Edit Modal ---------- */
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Invitation | null>(null);
  const [editDraft, setEditDraft] = useState<{ role: Invitation['role']; name?: string; description?: string; expires_days?: number | ''; max_uses?: number | '' }>({
    role: (allowedInviteRoles.includes('member') ? 'member' : allowedInviteRoles[0]) as Invitation['role'],
  });

  function openEdit(iv: Invitation) {
    setEditTarget(iv);
    setEditDraft({
      role: iv.role,
      name: iv.name || '',
      description: iv.description || '',
      expires_days: '',
      max_uses: iv.max_uses ?? '',
    });
    setEditOpen(true);
  }
  function closeEdit() {
    setEditOpen(false);
    setEditTarget(null);
  }

  /** ---------- Helpers ---------- */
  function getShareUrl(iv: Invitation): string {
    const fromServer = iv.invitation_url || iv.url;
    if (fromServer) return fromServer;
    if (typeof window !== 'undefined') return `${window.location.origin}/invite/${iv.token}`;
    return `/invite/${iv.token}`;
  }

  function inviteStatus(iv: Invitation): 'active' | 'expired' | 'inactive' | 'exceeded' {
    if (!iv.is_active) return 'inactive';
    if (iv.is_expired || (iv.expires_at && new Date(iv.expires_at).getTime() < Date.now())) return 'expired';
    if (iv.is_usage_exceeded || (iv.max_uses != null && iv.uses_count >= iv.max_uses)) return 'exceeded';
    return 'active';
  }

  const hasCreatedBy = useMemo(
    () => invites.some(iv => iv.created_by_id != null || iv.created_by_username != null),
    [invites]
  );

  const filteredInvites = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();

    return (invites || [])
      .filter(iv => {
        // "Only show my invitations" filter
        if (onlyMine && hasCreatedBy && currentUserId != null) {
          if (iv.created_by_id == null) return false;
          if (String(iv.created_by_id) !== String(currentUserId)) return false;
        }
        if (inviteRoleFilter !== 'all' && iv.role !== inviteRoleFilter) return false;
        if (inviteStatusFilter !== 'all' && inviteStatus(iv) !== inviteStatusFilter) return false;
        if (!q) return true;
        const hay = [
          iv.name || '',
          iv.description || '',
          iv.role || '',
          iv.token || '',
          iv.expires_at || '',
          iv.created_by_username || '',
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));
  }, [invites, inviteSearch, inviteRoleFilter, inviteStatusFilter, onlyMine, hasCreatedBy, currentUserId]);

  function usagePercent(iv: Invitation) {
    if (!iv.max_uses || iv.max_uses <= 0) return 0;
    const pct = Math.min(100, Math.round((iv.uses_count / iv.max_uses) * 100));
    return isFinite(pct) ? pct : 0;
  }

  function usageBadgeStyle(iv: Invitation) {
    const pct = usagePercent(iv);
    if (pct >= 100) return { color: '#991b1b', borderColor: '#fca5a5', bg: '#fee2e2' };
    if (pct >= 80) return { color: '#92400e', borderColor: '#fcd34d', bg: '#fef3c7' };
    return { color: '#065f46', borderColor: '#86efac', bg: '#d1fae5' };
  }

  /** ---------- Validate form ---------- */
  function validateCreate(): string | null {
    if (inviteForm.expires_days != null) {
      const d = inviteForm.expires_days;
      if (d <= 0) return 'Expires in days must be greater than 0.';
      if (d > 365) return 'Expires in days cannot exceed 365.';
    }
    if (inviteForm.max_uses != null) {
      const m = inviteForm.max_uses;
      if (m <= 0) return 'Max uses must be greater than 0.';
      if (m > 1000) return 'Max uses cannot exceed 1000.';
    }
    return null;
  }
  function validateEdit(): string | null {
    if (editDraft.expires_days !== '' && editDraft.expires_days != null) {
      const d = Number(editDraft.expires_days);
      if (d <= 0) return 'Expires in days must be greater than 0.';
      if (d > 365) return 'Expires in days cannot exceed 365.';
    }
    if (editDraft.max_uses !== '' && editDraft.max_uses != null) {
      const m = Number(editDraft.max_uses);
      if (m <= 0) return 'Max uses must be greater than 0.';
      if (m > 1000) return 'Max uses cannot exceed 1000.';
    }
    return null;
  }

  /** ---------- Actions ---------- */
  async function createInvite() {
    if (!ws) return;
    const err = validateCreate();
    if (err) return onShowMsg(err, 'error');

    const body: any = { 
      workspace: ws.id,
      role: inviteForm.role 
    };
    if (inviteForm.name) body.name = inviteForm.name;
    if (inviteForm.description) body.description = inviteForm.description;
    if (inviteForm.expires_days) body.expires_in_days = inviteForm.expires_days;
    if (inviteForm.max_uses) body.max_uses = inviteForm.max_uses;

    const created = await onApiSend<Invitation>(`/api/workspaces/${ws.id}/invitations/`, 'POST', body);
    if (created) {
      onShowMsg('Invitation created', 'success');
      await onRefreshInvites(ws.id);
      setInviteForm({ role: (allowedInviteRoles.includes('member') ? 'member' : allowedInviteRoles[0]) as Invitation['role'] });
    }
  }

  async function updateInvite() {
    if (!ws || !editTarget) return;
    const err = validateEdit();
    if (err) return onShowMsg(err, 'error');

    const body: any = {
      workspace: ws.id,
    };
    if (editDraft.name !== undefined) body.name = editDraft.name || null;
    if (editDraft.description !== undefined) body.description = editDraft.description || null;
    if (editDraft.role && editDraft.role !== editTarget.role) body.role = editDraft.role;
    if (editDraft.expires_days !== '' && editDraft.expires_days !== undefined) body.expires_in_days = Number(editDraft.expires_days);
    if (editDraft.max_uses !== '' && editDraft.max_uses !== undefined) body.max_uses = Number(editDraft.max_uses);

    const ok = await onApiSend<Invitation>(`/api/workspaces/${ws.id}/invitations/${editTarget.id}/`, 'PATCH', body);
    if (ok) {
      onShowMsg('Invitation updated', 'success');
      await onRefreshInvites(ws.id);
      closeEdit();
    }
  }

  async function deactivateInvite(inviteId: string) {
    if (!ws) return;
    const ok = await onApiSend(`/api/workspaces/${ws.id}/invitations/${inviteId}/deactivate/`, 'POST');
    if (ok) {
      onShowMsg('Invitation deactivated', 'success');
      await onRefreshInvites(ws.id);
    }
  }

  // Activate invitation (set is_active to true)
  async function activateInvite(inviteId: string) {
    if (!ws) return;
    const ok = await onApiSend(`/api/workspaces/${ws.id}/invitations/${inviteId}/`, 'PATCH', { is_active: true });
    if (ok) {
      onShowMsg('Invitation activated', 'success');
      await onRefreshInvites(ws.id);
    }
  }

  async function deleteInvite(inviteId: string) {
    if (!ws) return;
    const confirmed = window.confirm('Delete this invitation link permanently?');
    if (!confirmed) return;
    const ok = await onApiSend(`/api/workspaces/${ws.id}/invitations/${inviteId}/`, 'DELETE');
    if (ok !== null) {
      onShowMsg('Invitation deleted', 'success');
      await onRefreshInvites(ws.id);
    }
  }

  async function copyInviteUrl(invite: Invitation) {
    try {
      const url = getShareUrl(invite);
      await navigator.clipboard.writeText(url);
      onShowMsg('Invite link copied', 'success');
    } catch {
      onShowMsg('Copy failed. Manually select the URL.', 'error');
    }
  }

  async function cleanupExpired() {
    if (!ws) return;
    const ok = await onApiSend(`/api/workspaces/${ws.id}/invitations/cleanup_expired/`, 'POST');
    if (ok) {
      onShowMsg('Expired invitations cleaned', 'success');
      await onRefreshInvites(ws.id);
    }
  }

  /** ---------- Render ---------- */
  return (
    <>
      <header className="page-header">
        <h1>Invitations</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      {/* Create & Tools */}
      <section className="card create-card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Create Invitation</h3>
          <div className="muted">Available roles depend on your permissions. Limits: max_uses ≤ 1000, expires_in_days ≤ 365.</div>
        </div>

        <div className="form-container">
          {/* Row 1: Role and Name */}
          <div className="grid2">
            <div className="form-row">
              <label>Role</label>
              <select
                className="input"
                value={inviteForm.role}
                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Invitation['role'] })}
              >
                {allowedInviteRoles.map(r => (
                  <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="required-label">
                Name <span className="required-mark">*</span>
              </label>
              <input
                className="input"
                placeholder="Unique name for this invitation"
                value={inviteForm.name || ''}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Row 2: Expires in days and Max uses */}
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="form-row">
              <label>Expires (days)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                placeholder="e.g. 30"
                value={inviteForm.expires_days ?? ''}
                onChange={(e) => setInviteForm({ ...inviteForm, expires_days: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              />
              <span className="hint">Optional, max 365 days</span>
            </div>

            <div className="form-row">
              <label>Max uses</label>
              <input
                className="input"
                type="number"
                min={1}
                max={1000}
                placeholder="e.g. 100"
                value={inviteForm.max_uses ?? ''}
                onChange={(e) => setInviteForm({ ...inviteForm, max_uses: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              />
              <span className="hint">Optional, max 1000</span>
            </div>
          </div>

          {/* Row 3: Description (full width) */}
          <div className="form-row" style={{ marginTop: 12 }}>
            <label>Description (optional)</label>
            <input
              className="input"
              placeholder="Brief description"
              value={inviteForm.description || ''}
              onChange={(e) => setInviteForm({ ...inviteForm, description: e.target.value })}
            />
          </div>

          <div className="row between" style={{ marginTop: 16 }}>
            {hasCreatedBy && currentUserId != null ? (
              <label className="toggle">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                <span>Only show my invitations</span>
              </label>
            ) : <span />}
            <div className="row-end">
              <button className="ghost" onClick={() => ws && onRefreshInvites(ws.id)}>Refresh</button>
              <button className="ghost" onClick={cleanupExpired}>Cleanup expired</button>
              <button className="primary" onClick={createInvite} disabled={!canManageInvites}>Create</button>
            </div>
          </div>
        </div>
      </section>

      {/* Filters + Table */}
      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Links</h3>
          <div className="grid3" style={{ gap: 8, alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Search name/desc/token/creator…"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
            />
            <select
              className="input"
              value={inviteRoleFilter}
              onChange={(e) => setInviteRoleFilter(e.target.value as any)}
            >
              <option value="all">All roles</option>
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <select
              className="input"
              value={inviteStatusFilter}
              onChange={(e) => setInviteStatusFilter(e.target.value as any)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
              <option value="exceeded">Usage Exceeded</option>
            </select>
          </div>
        </div>

        {filteredInvites.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <p>No invitations.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Token</th>
                <th>Expires</th>
                <th>Uses</th>
                <th>Status</th>
                {hasCreatedBy && <th>Creator</th>}
                <th style={{ width: 320 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvites.map(iv => {
                const status = inviteStatus(iv);
                const pct = usagePercent(iv);
                const badge = usageBadgeStyle(iv);
                return (
                  <tr key={iv.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <b>{iv.name}</b>
                        <span className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {iv.description || '—'}
                        </span>
                      </div>
                    </td>
                    <td><span className="badge">{iv.role}</span></td>
                    <td className="mono cut" title={iv.token}>{iv.token}</td>
                    <td>{iv.expires_at ? new Date(iv.expires_at).toLocaleString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.borderColor}` }}>
                          {iv.uses_count}{iv.max_uses ? ` / ${iv.max_uses}` : ''}
                        </span>
                        {iv.max_uses ? (
                          <div className="bar" style={{ width: 120 }}>
                            <div className="bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {status === 'active' && <span style={{ color: '#065f46', fontWeight: 700 }}>Active</span>}
                      {status === 'expired' && <span style={{ color: '#92400e', fontWeight: 700 }}>Expired</span>}
                      {status === 'inactive' && <span style={{ color: '#6b7280', fontWeight: 700 }}>Inactive</span>}
                      {status === 'exceeded' && <span style={{ color: '#991b1b', fontWeight: 700 }}>Exceeded</span>}
                    </td>
                    {hasCreatedBy && (
                      <td className="cut">{iv.created_by_username || String(iv.created_by_id ?? '—')}</td>
                    )}
                    <td className="actions">
                      <button className="ghost" onClick={() => copyInviteUrl(iv)}>Copy Link</button>
                      {iv.is_active ? (
                        <button className="ghost" onClick={() => deactivateInvite(iv.id)} disabled={!canManageInvites}>Deactivate</button>
                      ) : (
                        <button className="ghost" onClick={() => activateInvite(iv.id)} disabled={!canManageInvites}>Activate</button>
                      )}
                      <button className="ghost" onClick={() => openEdit(iv)} disabled={!canManageInvites}>Edit</button>
                      <button className="danger outline" onClick={() => deleteInvite(iv.id)} disabled={!canManageInvites}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Edit Modal */}
      {editOpen && editTarget && (
        <div className="modal-mask" onClick={closeEdit}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <header className="modal-head">
              <h3 style={{ margin: 0 }}>Edit Invitation</h3>
              <span className="muted mono">{editTarget.token}</span>
            </header>
            <div className="modal-body">
              {/* Row 1: Role and Name */}
              <div className="grid2">
                <div className="form-row">
                  <label>Role</label>
                  <select
                    className="input"
                    value={editDraft.role}
                    onChange={(e) => setEditDraft(prev => ({ ...prev, role: e.target.value as Invitation['role'] }))}
                  >
                    {allowedInviteRoles.map(r => (
                      <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <label className="required-label">
                    Name <span className="required-mark">*</span>
                  </label>
                  <input
                    className="input"
                    placeholder="Name"
                    value={editDraft.name ?? ''}
                    onChange={(e) => setEditDraft(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* Row 2: Reset expires in days and Max uses */}
              <div className="grid2" style={{ marginTop: 12 }}>
                <div className="form-row">
                  <label>Expires (days)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="Leave empty to keep"
                    value={editDraft.expires_days === '' ? '' : editDraft.expires_days ?? ''}
                    onChange={(e) => setEditDraft(prev => ({ ...prev, expires_days: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                  <span className="hint">Reset expiry, max 365</span>
                </div>

                <div className="form-row">
                  <label>Max uses</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="Leave empty to keep"
                    value={editDraft.max_uses === '' ? '' : editDraft.max_uses ?? ''}
                    onChange={(e) => setEditDraft(prev => ({ ...prev, max_uses: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                  <span className="hint">Leave empty to keep</span>
                </div>
              </div>

              {/* Row 3: Description (full width) */}
              <div className="form-row" style={{ marginTop: 12 }}>
                <label>Description (optional)</label>
                <input
                  className="input"
                  placeholder="Description"
                  value={editDraft.description ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <footer className="modal-foot">
              <button className="ghost" onClick={closeEdit}>Cancel</button>
              <button className="primary" onClick={updateInvite} disabled={!canManageInvites}>Save</button>
            </footer>
          </div>
        </div>
      )}

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card.create-card { background: linear-gradient(135deg, #faf5ff 0%, #fef7ed 100%); box-shadow: 0 4px 12px rgba(249, 168, 212, 0.12); }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .card-head h3 { background: linear-gradient(135deg, #ec4899, #f59e0b, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; margin: 0; }
        .form-container { background: rgba(255, 255, 255, 0.7); border-radius: 12px; padding: 16px; border: 1px solid rgba(243, 232, 255, 0.5); overflow: hidden; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
        .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline { padding:10px 14px; border-radius:12px; background:#fff; color:#dc2626; border:2px solid #f87171; font-weight:700; cursor:pointer; }
        .danger.outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .row-end { display:flex; justify-content:flex-end; gap:8px; }
        .row { display:flex; gap:8px; align-items:center; }
        .between { justify-content:space-between; }
        .toggle { display:flex; gap:8px; align-items:center; color:#6b7280; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; box-sizing: border-box; }
        .grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        @media (max-width: 900px) { .grid3 { grid-template-columns:1fr; } .grid2 { grid-template-columns:1fr; } }
        .form-row { display:grid; gap:6px; min-width: 0; }
        .form-row label { font-size: 13px; font-weight: 600; color: #6b7280; }
        .required-label { color: #374151 !important; }
        .required-mark { color: #dc2626; font-weight: 700; margin-left: 2px; }
        .hint { font-size: 11px; color: #9ca3af; margin-top: -2px; line-height: 1.3; }
        .muted { color:#6b7280; font-size:12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }
        .cut { max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .table { width:100%; border-collapse:separate; border-spacing:0; }
        .table th, .table td { text-align:left; padding:10px 8px; border-bottom: 1px dashed #e9d5ff; vertical-align: middle; }
        .table th { font-size:12px; color:#6b7280; font-weight:600; }
        .actions { display:flex; gap:8px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
          background: linear-gradient(135deg, #fce7f3, #fef3c7); color: #92400e; }
        .bar { height:12px; border-radius:999px; background:#f3e8ff; overflow:hidden; margin-top:10px; }
        .bar-fill { height:100%; background: linear-gradient(90deg, #c084fc, #f9a8d4); }

        /* Modal */
        .modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.15); display:flex; justify-content:center; align-items:center; z-index: 60; }
        .modal { width: 720px; max-width: 92vw; background: #fff; border: 2px solid #f3e8ff; border-radius: 16px; box-shadow: 0 10px 24px rgba(0,0,0,.08); }
        .modal-head { padding: 16px; border-bottom: 1px dashed #e9d5ff; display:flex; align-items:center; justify-content:space-between; }
        .modal-body { padding: 16px; }
        .modal-foot { padding: 12px 16px; border-top: 1px dashed #e9d5ff; display:flex; gap:8px; justify-content:flex-end; }
      `}</style>
    </>
  );
}
