// components/WorkspacePage.tsx
'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveUser, getUser, clearUser } from '../lib/userStorage';
import { appendAuthHeaders, getCsrfTokenFromCookie, redirectToAuthWithNext } from '@/lib/authHelpers';
import Members from './workspace/Members';
import Permissions from './workspace/Permissions';
import Invitations from './workspace/Invitations';
import Audit from './workspace/Audit';
import Settings from './workspace/Settings';
import AssetGrid from './asset/AssetGrid';
import FileUpload from './asset/FileUpload';
import StorageDashboard from './asset/StorageDashboard';
import Navbar from './navbar/Navbar';

/** -------------------- Types -------------------- **/
type Workspace = {
  id: string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  type?: 'standard' | 'demo' | 'enterprise';
};

type MemberRaw = {
  id: number | string; // NOTE: this is membership id
  workspace: string;
  workspace_name: string;
  user: number;
  user_username: string;
  user_email: string;
  user_full_name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  is_active: boolean;
  assigned_at: string;
  invited_by: number | null;
  invitation_accepted_at: string | null;
  custom_permissions: Record<string, any>;
  is_owner: boolean;
  can_manage_users: boolean;
  can_manage_billing: boolean;
};
type Member = {
  id: string; // membership id
  user: { id: string; username: string; email: string; full_name?: string };
  role: 'owner' | 'admin' | 'member' | 'viewer';
  is_active: boolean;
  joined_at?: string;
};

type CurrentUser = {
  id: string | number;
  username?: string;
  email?: string;
};

type WSPermission = {
  id: string;
  membership: string; // membership id
  // Content/Library
  can_view_library?: boolean;
  can_upload_assets?: boolean;
  can_generate_variants?: boolean;
  can_edit_variants?: boolean;
  can_approve_variants?: boolean;
  can_export_data?: boolean;
  // Admin
  can_manage_users?: boolean;
  can_manage_settings?: boolean;
  can_manage_invitations?: boolean;
  can_view_audit_logs?: boolean;
  // Billing
  can_view_billing?: boolean;
  can_manage_billing?: boolean;
  can_update_token_balance?: boolean;
  // Critical
  can_delete_workspace?: boolean;
  can_transfer_ownership?: boolean;
  // Limits
  max_upload_size_mb: number;
  max_monthly_jobs?: number;
};

type Invitation = {
  id: string;
  token: string;
  role: 'admin' | 'member' | 'viewer';
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;  // Updated to match backend field name
  created_at?: string;
  // Extended from backend serializer (if available):
  name?: string | null;
  description?: string | null;
  is_expired?: boolean;
  is_usage_exceeded?: boolean;
  is_valid?: boolean;
  remaining_uses?: number | null;
  invitation_url?: string | null; // sometimes backend returns full share URL
  url?: string | null;             // some stacks name it `url`
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
};

type Asset = {
  id: string;
  workspace_id: string;
  uploader_name: string;
  file: string;
  size: number;
  file_size_display: string;
  mime_type: string;
  checksum: string;
  uploaded_at: string;
  is_active: boolean;
};
type Message = { text: string; type: 'success' | 'error' } | null;

const PLAN_LABEL: Record<Workspace['plan'], string> = {
  free: 'Free',
  basic: 'Plus',
  pro: 'Pro',
  enterprise: 'Business',
};

type Tab = 'overview' | 'members' | 'permissions' | 'invitations' | 'audit' | 'settings' | 'assets' | 'upload' | 'storage';

/** -------------------- Component -------------------- **/
export default function WorkspacePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const router = useRouter();

  // Core state
  const [ws, setWs] = useState<Workspace | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [perms, setPerms] = useState<WSPermission[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [usage, setUsage] = useState<InviteUsage[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  // UI state
  const [toast, setToast] = useState<Message>(null);
  const [newWSName, setNewWSName] = useState<string>('');
  const [creatingWorkspace, setCreatingWorkspace] = useState<boolean>(false);

  // Pagination state for workspace table
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function showMsg(text: string, type: 'success' | 'error' = 'success') {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2800);
  }

  // Convert backend member format to frontend format
  function normalizeMember(raw: MemberRaw): Member {
    return {
      id: String(raw.id),
      user: {
        id: String(raw.user),
        username: raw.user_username,
        email: raw.user_email,
        full_name: raw.user_full_name,
      },
      role: raw.role,
      is_active: raw.is_active,
      joined_at: raw.assigned_at,
    };
  }

  // Normalize list payloads to arrays
  function toArray<T = any>(payload: any): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && Array.isArray(payload.results)) return payload.results as T[];
    if (payload && Array.isArray(payload.data)) return payload.data as T[];
    return [];
  }

  /** -------------------- HTTP helpers -------------------- **/
  async function apiGET<T>(url: string): Promise<T | null> {
    try {
      const r = await fetch(url, { cache: 'no-store', credentials: 'include', headers: appendAuthHeaders() });
      if (r.status === 401 || r.status === 403) {
        redirectToAuthWithNext();
        return null;
      }
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch {
      return null;
    }
  }

  async function apiSend<T>(url: string, method: string, body?: any, contentType = 'application/json'): Promise<T | null> {
    try {
      let headers: Record<string, string> = {};

      // Only set content-type header for non-multipart requests
      if (!contentType.includes('multipart/form-data')) {
        headers['content-type'] = contentType;
      }

      // Add authentication token
      const authToken =
        (typeof window !== 'undefined' && window.sessionStorage.getItem('authToken')) ||
        (typeof window !== 'undefined' && window.localStorage.getItem('authToken'));
      if (authToken) {
        headers['Authorization'] = `Token ${authToken}`;
      }

      // Add CSRF token for mutation requests
      const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      const csrfToken = needsCsrf ? getCsrfTokenFromCookie() : null;
      headers = appendAuthHeaders(
        {
          ...headers,
          ...(needsCsrf && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
        { includeCsrf: needsCsrf }
      );

      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers,
        body: body ? (contentType.includes('json') ? JSON.stringify(body) : body) : undefined,
      });
      if (r.status === 401 || r.status === 403) {
        redirectToAuthWithNext();
        return null;
      }
      const text = await r.text();
      let payload: any = null;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }

      if (!r.ok) {
        const fieldErrors = Object.entries(payload || {})
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([k, v]: [string, any[]]) => `${k}: ${v[0]}`);
        const errorMsg =
          payload?.detail ||
          payload?.message ||
          (fieldErrors.length ? fieldErrors.join(' | ') : `Request failed (${r.status})`);
        showMsg(errorMsg, 'error');
        return null;
      }
      return payload as T;
    } catch (e: any) {
      showMsg(e?.message || 'Network error', 'error');
      return null;
    }
  }

  /** -------------------- Loaders -------------------- **/
  async function loadCurrentUser() {
    try {
      const cachedUser = getUser();
      if (cachedUser) {
        setCurrentUser(cachedUser);
        return cachedUser;
      }
      const userData = await apiGET<any>('/api/account/profile/');
      if (userData?.success && userData?.user) {
        setCurrentUser(userData.user);
        saveUser(userData.user);
        return userData.user;
      }
    } catch { /* noop */ }
    return null;
  }

  async function loadAllWorkspaces() {
    const data = await apiGET<any>('/api/workspaces?page_size=200');
    const workspaces = toArray<Workspace>(data);
    setAllWorkspaces(workspaces);
    return workspaces;
  }

  async function refreshInvites(wid: string) {
    const iv = await apiGET<any>(`/api/workspaces/${wid}/invitations?page_size=200`);
    setInvites(toArray<Invitation>(iv));
  }
  async function refreshUsage(wid: string) {
    const iu = await apiGET<any>(`/api/workspaces/${wid}/invitation-usage?page_size=200`);
    setUsage(toArray<InviteUsage>(iu));
  }
  async function refreshAssets(wid: string) {
    const as = await apiGET<any>(`/api/workspaces/${wid}/assets?page_size=1000`);
    setAssets(toArray<Asset>(as));
  }

  async function loadAllForWorkspace(working: Workspace) {
    setWs(working);
    const wid = working.id;

    if (!currentUser) {
      await loadCurrentUser();
    }

    const m = await apiGET<any>(`/api/workspaces/${wid}/members?page_size=200`);
    const rawMembers = toArray<MemberRaw>(m);
    setMembers(rawMembers.map(normalizeMember));

    const p = await apiGET<any>(`/api/workspaces/${wid}/permissions?page_size=200`);
    setPerms(toArray<WSPermission>(p));

    await refreshInvites(wid);
    await refreshUsage(wid);
    await refreshAssets(wid);
  }

  async function selectWorkspace(workspace: Workspace) {
    await loadAllForWorkspace(workspace);
    if (tab === 'overview') {
      setTab('members');
    }
  }

  function clearWorkspace() {
    setWs(null);
    setMembers([]);
    setPerms([]);
    setInvites([]);
    setUsage([]);
    setAssets([]);
  }

  /** -------------------- Account nav -------------------- **/
  async function onLogout() {
    try {
      await apiSend('/api/account/logout/', 'POST');
      // Clear user data from storage
      clearUser();
    } catch {}
    redirectToAuthWithNext();
  }
  function goProfile() { router.push('/profile'); }
  function goBilling() {
    if (!ws) return;
    router.push(`/workspaces/${ws.id}/billing`);
  }
  function goWorkspaceSearch() {
    if (!ws) return;
    router.push(`/workspaces/${ws.id}/search`);
  }

  /** -------------------- Init -------------------- **/
  useEffect(() => { (async () => { await loadCurrentUser(); await loadAllWorkspaces(); })(); }, []);

  /** -------------------- Derived -------------------- **/
  const storageUsedBytes = useMemo(
    () => (Array.isArray(assets) ? assets.reduce((s, a) => s + (a.size || 0), 0) : 0),
    [assets]
  );
  const storageUsedText = useMemo(() => humanSize(storageUsedBytes), [storageUsedBytes]);
  const storageMax = useMemo(() => (ws?.max_storage_gb ?? 1) * 1024 * 1024 * 1024, [ws]);
  const storageMaxText = useMemo(() => humanSize(storageMax), [ws, storageMax]);
  const storagePercent = useMemo(() => (storageMax ? Math.round((storageUsedBytes / storageMax) * 100) : 0), [storageUsedBytes, storageMax]);

  // Current user role
  const userRole = useMemo(() => {
    if (!currentUser || !Array.isArray(members)) return 'viewer';
    const me = members.find(m => String(m.user?.id || '') === String(currentUser.id || ''));
    return me?.role ?? 'viewer';
  }, [currentUser, members]);

  const canManageMembers = useMemo(() => ['owner', 'admin'].includes(userRole), [userRole]);
  const canManageInvites = useMemo(() => ['owner', 'admin'].includes(userRole), [userRole]);
  const canManageSettings = useMemo(() => userRole === 'owner', [userRole]);
  const canUploadAssets = useMemo(() => {
    if (!currentUser || !Array.isArray(perms)) return false;
    const myPerms = perms.find(p => String(p.membership) === String(members.find(m => String(m.user?.id || '') === String(currentUser.id || ''))?.id || ''));
    return myPerms?.can_upload_assets ?? false;
  }, [currentUser, perms, members]);

  // ----- Helpers -----
  function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // Calculate allowed roles for creating/editing invitations
  function getAllowedInviteRoles(role: Member['role']): Array<'viewer' | 'member' | 'admin'> {
    if (role === 'owner' || role === 'admin') return ['viewer', 'member', 'admin'];
    if (role === 'member') return ['viewer', 'member'];
    return ['viewer'];
  }

  async function createWorkspace(e: FormEvent) {
    e.preventDefault();
    if (!newWSName.trim()) {
      showMsg('Please enter a workspace name', 'error');
      return;
    }

    if (creatingWorkspace) {
      return; // Prevent duplicate submissions
    }

    setCreatingWorkspace(true);

    try {
      // Ensure current user is loaded before creating workspace
      if (!currentUser) {
        const user = await loadCurrentUser();
        if (!user) {
          showMsg('User authentication required. Please login again.', 'error');
          router.replace('/auth');
          return;
        }
      }

      const created = await apiSend<Workspace>('/api/workspaces/', 'POST', { name: newWSName.trim() });
      if (created) {
        showMsg(`Created workspace "${created.name}"`, 'success');
        setNewWSName('');
        // Refresh workspaces list
        await loadAllWorkspaces();
        // Automatically load the newly created workspace
        await loadAllForWorkspace(created);
        // Switch to members tab to show the workspace details
        setTab('members');
      } else {
        // Error message is already shown by apiSend
        // But we can add a more specific message if needed
        if (!toast) {
          showMsg('Failed to create workspace. Please try again.', 'error');
        }
      }
    } finally {
      setCreatingWorkspace(false);
    }
  }

  /** -------------------- Render -------------------- **/
  return (
     <>
      <Navbar /> 

    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <h2 style={{ margin: '0 8px 8px', fontSize: '22px', fontWeight: '800', background: 'linear-gradient(135deg, #ec4899, #f59e0b, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Workspace
          </h2>

          <div className="section-title">NAVIGATION</div>
          <nav className="menu">
            <button className={`item ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
              📊 Overview
            </button>
            <button className="item" onClick={goWorkspaceSearch} disabled={!ws}>
              🔍 Search
            </button>
            <button className={`item ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')} disabled={!ws}>
              👥 Members
            </button>
            <button className={`item ${tab === 'permissions' ? 'active' : ''}`} onClick={() => setTab('permissions')} disabled={!ws}>
              🔐 Permissions
            </button>
            <button className={`item ${tab === 'invitations' ? 'active' : ''}`} onClick={() => setTab('invitations')} disabled={!ws}>
              ✉️ Invitations
            </button>
            <button className={`item ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')} disabled={!ws}>
              📋 Audit
            </button>
            <button className={`item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')} disabled={!ws}>
              ⚙️ Settings
            </button>
            <div className="section-title" style={{ marginTop: 10 }}>ASSETS</div>
            <button className={`item ${tab === 'assets' ? 'active' : ''}`} onClick={() => setTab('assets')} disabled={!ws}>
              📁 Assets
            </button>
            <button className={`item ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')} disabled={!ws}>
              ⬆️ Upload
            </button>
            <button className={`item ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')} disabled={!ws}>
              💾 Storage
            </button>
            <div className="section-title" style={{ marginTop: 10 }}>BILLING</div>
            <button className="item" onClick={goBilling} disabled={!ws}>
              💳 Billing
            </button>
            <div className="section-title" style={{ marginTop: 10 }}>ACCOUNT</div>
            <button className="item" onClick={goProfile}>
              🙍 Profile
            </button>
          </nav>
        </div>

        <div className="logout">
          <button className="item full" onClick={onLogout}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="content">
        {/* Overview */}
        {tab === 'overview' && (
          <>
            <header className="page-header">
              <h1>All Workspaces</h1>
            </header>

            {/* Create Workspace Form */}
            <section className="card">
              <div className="card-head">
                <h3 style={{ margin: 0 }}>Create New Workspace</h3>
              </div>
              <form onSubmit={createWorkspace}>
                <div className="grid-add">
                  <input 
                    className="input" 
                    placeholder="Enter Workspace name to create"
                    value={newWSName} 
                    onChange={(e) => setNewWSName(e.target.value)}
                    disabled={creatingWorkspace}
                  />
                  <button 
                    className="primary" 
                    type="submit" 
                    disabled={!newWSName.trim() || creatingWorkspace}
                  >
                    {creatingWorkspace ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </section>

            {/* Workspaces Table */}
            <section className="card">
              <div className="card-head">
                <h3 style={{ margin: 0 }}>Your Workspaces ({allWorkspaces.length})</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="muted">Show:</span>
                  <select
                    className="input"
                    style={{ width: 'auto', padding: '6px 10px' }}
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>

              {allWorkspaces.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  <p>No workspaces found. Create your first workspace above!</p>
                </div>
              ) : (
                <>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Plan</th>
                        <th>Type</th>
                        <th>Max Users</th>
                        <th>Storage Limit</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allWorkspaces.slice((currentPage - 1) * pageSize, (currentPage - 1) * pageSize + pageSize).map((workspace) => (
                        <tr key={workspace.id}>
                          <td style={{ fontWeight: 600 }}>{workspace.name}</td>
                          <td><span className="badge">{PLAN_LABEL[workspace.plan]}</span></td>
                          <td>{workspace.type || 'standard'}</td>
                          <td>{workspace.max_users}</td>
                          <td>{workspace.max_storage_gb} GB</td>
                          <td className="actions">
                            <button className="primary small" onClick={() => selectWorkspace(workspace)}>Manage</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  {Math.ceil(allWorkspaces.length / pageSize) > 1 && (
                    <div className="pagination">
                      <button className="ghost" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>← Previous</button>
                      <span className="page-info">Page {currentPage} of {Math.ceil(allWorkspaces.length / pageSize)}</span>
                      <button className="ghost" onClick={() => setCurrentPage((p) => Math.min(Math.ceil(allWorkspaces.length / pageSize), p + 1))} disabled={currentPage === Math.ceil(allWorkspaces.length / pageSize)}>Next →</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {/* Members */}
        {tab === 'members' && (
          <Members
            ws={ws}
            members={members}
            canManageMembers={canManageMembers}
            onShowMsg={showMsg}
            onApiSend={apiSend}
            onApiGET={apiGET}
            onSetMembers={setMembers}
          />
        )}

        {/* Permissions */}
        {tab === 'permissions' && (
          <Permissions
            ws={ws}
            members={members}
            perms={perms}
            userRole={userRole}
            canManageMembers={canManageMembers}
            onShowMsg={showMsg}
            onApiSend={apiSend}
            onSetPerms={setPerms}
            currentUserId={currentUser?.id}
          />
        )}

        {/* Invitations */}
        {tab === 'invitations' && (
          <Invitations
            ws={ws}
            invites={invites}
            canManageInvites={canManageInvites}
            onShowMsg={showMsg}
            onApiSend={apiSend}
            onRefreshInvites={refreshInvites}
            /** New features: Limit roles that can be created/edited + "Only see roles I created" filter */
            allowedInviteRoles={getAllowedInviteRoles(userRole as Member['role'])}
            currentUserId={currentUser?.id}
          />
        )}

        {/* Audit */}
        {tab === 'audit' && (
          <Audit
            ws={ws}
            usage={usage}
            onShowMsg={showMsg}
            onRefreshUsage={refreshUsage}
            /** New adaptation: transparent transmission of current user and unified GET encapsulation for workspace_stats */
            currentUserId={currentUser?.id}
            onApiGet={apiGET}
          />
        )}

        {/* Settings */}
        {tab === 'settings' && (
          <Settings
            ws={ws}
            members={members}
            onShowMsg={showMsg}
            onApiSend={apiSend}
            onApiGET={apiGET}
            onLoadAllWorkspaces={async () => { await loadAllWorkspaces(); }}
            onLoadAllForWorkspace={loadAllForWorkspace}
            onClearWorkspace={clearWorkspace}
            onSetTab={setTab}
          />
        )}

        {/* Assets */}
        {tab === 'assets' && (
          <AssetGrid
            ws={ws}
            assets={assets}
            canUploadAssets={canUploadAssets}
            onShowMsg={showMsg}
            onApiSend={apiSend}
            onApiGET={apiGET}
            onSetAssets={setAssets}
          />
        )}

        {/* Upload */}
        {tab === 'upload' && (
          <FileUpload
            ws={ws}
            onShowMsg={showMsg}
            onApiSend={apiSend}
            onRefreshAssets={async () => { if (ws) await refreshAssets(ws.id); }}
          />
        )}

        {/* Storage */}
        {tab === 'storage' && (
          <StorageDashboard
            ws={ws}
            assets={assets}
            onShowMsg={showMsg}
          />
        )}
      </main>

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}

      <style jsx>{`
        .layout { min-height:100vh; display:grid; grid-template-columns:280px 1fr; gap:16px; padding:24px;
          background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%); font-family:'Inter',sans-serif; }
        .sidebar { display:flex; flex-direction:column; justify-content:space-between;
          background: rgba(255,255,255,.95); backdrop-filter: blur(16px); border-radius:24px; padding:20px 18px 28px;
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15), 0 4px 12px rgba(0,0,0,0.03); position:sticky; top:24px;
          min-height: calc(100vh - 48px); height:auto; }
        .sidebar:hover { box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15), 0 8px 24px rgba(255,184,107,0.20); }
        .logout { border-top: 1px solid #f3e8ff; padding-top: 12px; }
        .full { width:100%; }
        .section-title { margin:18px 8px 10px; font-size:12px; color:#9ca3af; letter-spacing:.06em; }
        .menu { display:grid; gap:6px; }
        .item { text-align:left; padding:10px 12px; border-radius:12px; border:2px solid transparent; background:transparent; cursor:pointer; color:#6b7280; font-weight:500; transition:.2s; }
        .item.active { background: linear-gradient(135deg,#f9a8d4,#fbbf24); color:#fff; box-shadow:0 4px 12px rgba(249,168,212,.35); }
        .item:disabled { opacity: 0.5; cursor: not-allowed; }
        .content { background: rgba(255,255,255,.95); backdrop-filter: blur(16px); border-radius:24px; padding:20px;
          box-shadow: 0 8px 24px rgba(236,72,153,.12), 0 2px 8px rgba(139,69,19,.06); min-height: calc(100vh - 48px); }
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary.small { padding:8px 12px; font-size:13px; }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
        .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline { padding:10px 14px; border-radius:12px; background:#fff; color:#dc2626; border:2px solid #f87171; font-weight:700; cursor:pointer; }
        .danger.outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline.full { width: 100%; }
        .danger-zone { border: 2px solid #fca5a5 !important; background: #fef2f2 !important; }
        .row-end { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; }
        .grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .grid-add { display:grid; grid-template-columns:1fr auto; gap:8px; }
        @media (max-width: 900px) { .grid-add { grid-template-columns:1fr; } .grid3 { grid-template-columns:1fr; } .grid2 { grid-template-columns:1fr; } }
        .kv .k { font-size:12px; color:#6b7280; }
        .kv .v { font-size:16px; font-weight:700; color:#111827; }
        .bar { height:12px; border-radius:999px; background:#f3e8ff; overflow:hidden; margin-top:10px; }
        .bar-fill { height:100%; background: linear-gradient(90deg, #c084fc, #f9a8d4); }
        .muted { color:#6b7280; font-size:12px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }
        .cut { max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .form-row { display:grid; gap:8px; }
        .table { width:100%; border-collapse:separate; border-spacing:0; }
        .table th, .table td { text-align:left; padding:10px 8px; border-bottom: 1px dashed #e9d5ff; vertical-align: middle; }
        .table th { font-size:12px; color:#6b7280; font-weight:600; }
        .actions { display:flex; gap:8px; }
        .toast { position: fixed; top: 16px; right: 16px; padding: 12px 16px; border-radius: 12px; font-weight:600; z-index: 50; border:1px solid transparent; }
        .toast.success { background:#d1fae5; color:#065f46; border-color:#86efac; }
        .toast.error { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
          background: linear-gradient(135deg, #fce7f3, #fef3c7); color: #92400e; }
        .pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px dashed #e9d5ff; }
        .page-info { color: #6b7280; font-weight: 600; }
        /* Drawer */
        .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.15); display:flex; justify-content:flex-end; z-index: 60; }
        .drawer { width: 420px; height: 100%; background: #fff; border-left: 2px solid #f3e8ff; padding: 16px; display:flex; flex-direction:column; }
        .drawer-head { display:flex; align-items:center; justify-content:space-between; }
        .drawer-body { margin-top: 12px; padding-right: 8px; overflow: auto; }
        .drawer-foot { display:flex; gap:8px; align-items:center; padding-top: 10px; border-top:1px dashed #e9d5ff; }
        .perm-group { border: 2px solid #f3e8ff; border-radius: 12px; padding: 10px; margin-bottom: 12px; background: #faf5ff; }
        .perm-group.danger { background:#fef2f2; border-color:#fecaca; }
        .perm-title { font-weight: 800; margin-bottom: 8px; font-size: 13px; color:#7c3aed; }
        .perm-item { display:flex; gap:8px; align-items:center; padding: 4px 0; }
      `}</style>
    </div>
    </>
  );
}
