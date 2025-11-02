// components/workspace/Settings.tsx
'use client';

import { useState, FormEvent } from 'react';

type Workspace = {
  id: string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  max_users: number;
  max_storage_gb: number;
  type?: 'standard' | 'demo' | 'enterprise';
};

type Member = {
  id: string;
  user: { id: string; username: string; email: string; full_name?: string };
  role: 'owner' | 'admin' | 'member' | 'viewer';
  is_active: boolean;
  joined_at?: string;
};

interface SettingsProps {
  ws: Workspace | null;
  members: Member[];
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onApiSend: <T>(url: string, method: string, body?: any, contentType?: string) => Promise<T | null>;
  onApiGET: <T>(url: string) => Promise<T | null>;
  onLoadAllWorkspaces: () => Promise<void>;
  onLoadAllForWorkspace: (workspace: Workspace) => Promise<void>;
  onClearWorkspace: () => void;
  onSetTab: (tab: 'overview' | 'members' | 'permissions' | 'invitations' | 'audit' | 'settings' | 'assets' | 'upload' | 'storage') => void;
}

export default function Settings({ 
  ws, 
  members,
  onShowMsg, 
  onApiSend, 
  onApiGET, 
  onLoadAllWorkspaces, 
  onLoadAllForWorkspace,
  onClearWorkspace,
  onSetTab
}: SettingsProps) {
  const [rename, setRename] = useState('');
  const [transferUser, setTransferUser] = useState('');

  function isUUID(v: string) { 
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); 
  }
  
  function isNumericId(v: string) { 
    return /^\d+$/.test(v); 
  }
  
  type BareUser = { id: string | number; email?: string; username?: string };
  
  async function resolveUserIdByEmailOrId(input: string): Promise<string | null> {
    const v = input.trim();
    if (!v) return null;
    if (isUUID(v) || isNumericId(v)) return v;
    const tryEndpoints = [
      `/api/account/users?search=${encodeURIComponent(v)}`,
      `/api/users?search=${encodeURIComponent(v)}`
    ];
    for (const url of tryEndpoints) {
      const data = await onApiGET<any>(url);
      const arr: BareUser[] = Array.isArray(data) ? data
        : Array.isArray((data as any)?.results) ? (data as any).results
        : [];
      if (arr.length > 0) {
        const exact = arr.find(u => (u.email || '').toLowerCase() === v.toLowerCase());
        const pick = exact || arr[0];
        if (pick?.id != null) return String(pick.id);
      }
    }
    return null;
  }

  async function renameWorkspace(e: FormEvent) {
    e.preventDefault();
    if (!ws || !rename.trim()) return;
    const updated = await onApiSend<Workspace>(`/api/workspaces/${ws.id}/`, 'PATCH', { name: rename.trim() });
    if (updated) {
      onShowMsg('Workspace renamed', 'success');
      setRename('');
      await onLoadAllWorkspaces();
    }
  }

  // Find matching user in workspace members
  function findMemberByEmailOrUsername(input: string): Member | null {
    const searchTerm = input.trim().toLowerCase();
    if (!searchTerm) return null;
    
    return members.find(member => {
      const email = member.user.email?.toLowerCase() || '';
      const username = member.user.username?.toLowerCase() || '';
      const fullName = member.user.full_name?.toLowerCase() || '';
      
      return email === searchTerm || 
             username === searchTerm || 
             fullName === searchTerm ||
             email.includes(searchTerm) ||
             username.includes(searchTerm);
    }) || null;
  }

  async function transferOwnership(e: FormEvent) {
    e.preventDefault();
    if (!ws || !transferUser.trim()) return;
    
    // First, find the target user in workspace members
    const targetMember = findMemberByEmailOrUsername(transferUser.trim());
    if (!targetMember) {
      onShowMsg('Target user is not a member of this workspace.', 'error');
      return;
    }
    
    // Check if target user is already the current owner
    if (targetMember.role === 'owner') {
      onShowMsg('Target user is already the owner of this workspace.', 'error');
      return;
    }
    
    // Check if target user is active
    if (!targetMember.is_active) {
      onShowMsg('Target user is not an active member of this workspace.', 'error');
      return;
    }
    
    const ok = await onApiSend(`/api/workspaces/${ws.id}/transfer_ownership/`, 'POST', { 
      new_owner_id: targetMember.user.id 
    });
    if (ok) {
      onShowMsg(`Ownership transferred to ${targetMember.user.username}`, 'success');
      setTransferUser('');
      await onLoadAllForWorkspace(ws);
    }
  }

  async function deleteWorkspace() {
    if (!ws) return;
    const confirmed = window.confirm(`Delete workspace "${ws.name}"? This action cannot be undone.`);
    if (!confirmed) return;
    const res = await onApiSend(`/api/workspaces/${ws.id}/`, 'DELETE');
    if (res !== null) {
      onShowMsg('Workspace deleted', 'success');
      // Clear current workspace and return to overview
      onClearWorkspace();
      onSetTab('overview');
      await onLoadAllWorkspaces();
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Settings</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      <section className="card">
        <div className="form-row">
          <label>Rename workspace</label>
          <div className="grid-add">
            <input 
              className="input" 
              placeholder={ws?.name || 'Workspace name'} 
              value={rename} 
              onChange={(e) => setRename(e.target.value)} 
            />
            <button 
              className="primary" 
              onClick={renameWorkspace as any} 
              disabled={!rename.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="form-row">
          <label>Transfer ownership</label>
          <div className="grid-add">
            <select 
              className="input" 
              value={transferUser} 
              onChange={(e) => setTransferUser(e.target.value)}
            >
              <option value="">Select a member to transfer ownership to...</option>
              {members
                .filter(member => member.role !== 'owner' && member.is_active)
                .map(member => (
                  <option key={member.id} value={member.user.email}>
                    {member.user.username} ({member.user.email}) - {member.role}
                  </option>
                ))
              }
            </select>
            <button 
              className="primary" 
              onClick={transferOwnership as any} 
              disabled={!transferUser.trim()}
            >
              Transfer
            </button>
          </div>
        </div>
        <div className="muted">
          Only current owner can transfer ownership. Select an active member from the dropdown above.
        </div>
        {members.filter(member => member.role !== 'owner' && member.is_active).length === 0 && (
          <div className="muted" style={{ color: '#dc2626', marginTop: '8px' }}>
            No eligible members found. Add members to the workspace first.
          </div>
        )}
      </section>

      <section className="card danger-zone">
        <div className="form-row">
          <label style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ Danger Zone</label>
          <div className="muted" style={{ marginBottom: '12px' }}>
            Once you delete a workspace, there is no going back. This will permanently delete all workspace data, members, and assets.
          </div>
          <button 
            className="danger outline full" 
            onClick={deleteWorkspace} 
            disabled={!ws}
          >
            Delete Workspace
          </button>
        </div>
      </section>

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline { padding:10px 14px; border-radius:12px; background:#fff; color:#dc2626; border:2px solid #f87171; font-weight:700; cursor:pointer; }
        .danger.outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline.full { width: 100%; }
        .danger-zone { border: 2px solid #fca5a5 !important; background: #fef2f2 !important; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; }
        .grid-add { display:grid; grid-template-columns:1fr auto; gap:8px; }
        @media (max-width: 900px) { .grid-add { grid-template-columns:1fr; } }
        .form-row { display:grid; gap:8px; }
        .muted { color:#6b7280; font-size:12px; }
      `}</style>
    </>
  );
}
