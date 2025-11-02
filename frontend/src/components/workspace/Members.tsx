// components/workspace/Members.tsx
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

type MemberRaw = {
  id: number | string;
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

type Message = { text: string; type: 'success' | 'error' } | null;

interface MembersProps {
  ws: Workspace | null;
  members: Member[];
  canManageMembers: boolean;
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onApiSend: <T>(url: string, method: string, body?: any, contentType?: string) => Promise<T | null>;
  onApiGET: <T>(url: string) => Promise<T | null>;
  onSetMembers: (members: Member[]) => void;
}

export default function Members({ 
  ws, 
  members, 
  canManageMembers, 
  onShowMsg, 
  onApiSend, 
  onApiGET, 
  onSetMembers 
}: MembersProps) {
  const [memberForm, setMemberForm] = useState({ email: '', role: 'member' as Member['role'] });

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

  async function addMember() {
    if (!ws || !memberForm.email.trim()) return;
    const userId = await resolveUserIdByEmailOrId(memberForm.email);
    if (!userId) { 
      onShowMsg('User not found by that email. Consider creating an invitation link.', 'error'); 
      return; 
    }
    const body = { workspace: ws.id, user: userId, role: memberForm.role };
    const added = await onApiSend<MemberRaw>(`/api/workspaces/${ws.id}/members/`, 'POST', body);
    if (added) {
      onShowMsg('Member added', 'success');
      setMemberForm({ email: '', role: 'member' });
      const normalized = normalizeMember(added);
      onSetMembers([...members, normalized]);
    }
  }

  async function removeMember(memberId: string) {
    if (!ws) return;
    const ok = await onApiSend(`/api/workspaces/${ws.id}/members/${memberId}/`, 'DELETE');
    if (ok !== null) {
      onShowMsg('Member removed', 'success');
      onSetMembers(members.filter(m => m.id !== memberId));
    }
  }

  async function updateMemberRole(member: Member, newRole: Member['role']) {
    if (!ws) return;
    const updated = await onApiSend<MemberRaw>(`/api/workspaces/${ws.id}/members/${member.id}/`, 'PATCH', { role: newRole });
    if (updated) {
      onShowMsg('Role updated', 'success');
      const normalized = normalizeMember(updated);
      onSetMembers(members.map(m => (m.id === member.id ? normalized : m)));
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Members</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      {canManageMembers && (
        <section className="card">
          <div className="card-head">
            <h3 style={{ margin: 0 }}>Add Member</h3>
          </div>
          <div className="grid-add">
            <input 
              className="input" 
              placeholder="Email address" 
              value={memberForm.email} 
              onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} 
            />
            <select 
              className="input" 
              value={memberForm.role} 
              onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as Member['role'] })}
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button className="primary" onClick={addMember}>Add</button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Team Members ({members.length})</h3>
        </div>

        {members.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <p>No members found in this workspace.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                {canManageMembers && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.user?.username ?? '—'}</td>
                  <td>{m.user?.email ?? '—'}</td>
                  <td>
                    {canManageMembers && m.role !== 'owner' ? (
                      <select 
                        className="input" 
                        value={m.role} 
                        onChange={(e) => updateMemberRole(m, e.target.value as Member['role'])}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="badge">{m.role}</span>
                    )}
                  </td>
                  <td>{m.is_active ? '✅ Active' : '⭕ Inactive'}</td>
                  <td>{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}</td>
                  {canManageMembers && (
                    <td className="actions">
                      {m.role !== 'owner' && (
                        <button className="danger outline" onClick={() => removeMember(m.id)}>
                          Remove
                        </button>
                      )}
                    </td>
                  )}
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
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .danger.outline { padding:10px 14px; border-radius:12px; background:#fff; color:#dc2626; border:2px solid #f87171; font-weight:700; cursor:pointer; }
        .danger.outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; }
        .grid-add { display:grid; grid-template-columns:1fr auto; gap:8px; }
        @media (max-width: 900px) { .grid-add { grid-template-columns:1fr; } }
        .muted { color:#6b7280; font-size:12px; }
        .table { width:100%; border-collapse:separate; border-spacing:0; }
        .table th, .table td { text-align:left; padding:10px 8px; border-bottom: 1px dashed #e9d5ff; vertical-align: middle; }
        .table th { font-size:12px; color:#6b7280; font-weight:600; }
        .actions { display:flex; gap:8px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
          background: linear-gradient(135deg, #fce7f3, #fef3c7); color: #92400e; }
      `}</style>
    </>
  );
}
