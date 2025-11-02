// components/workspace/Permissions.tsx
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

type Member = {
  id: string;
  user: { id: string; username: string; email: string; full_name?: string };
  role: 'owner' | 'admin' | 'member' | 'viewer';
  is_active: boolean;
  joined_at?: string;
};

type WSPermission = {
  id: string;
  membership: string;
  can_view_library?: boolean;
  can_upload_assets?: boolean;
  can_generate_variants?: boolean;
  can_edit_variants?: boolean;
  can_approve_variants?: boolean;
  can_export_data?: boolean;
  can_manage_users?: boolean;
  can_manage_settings?: boolean;
  can_manage_invitations?: boolean;
  can_view_audit_logs?: boolean;
  can_view_billing?: boolean;
  can_manage_billing?: boolean;
  can_update_token_balance?: boolean;
  can_delete_workspace?: boolean;
  can_transfer_ownership?: boolean;
  max_upload_size_mb: number;
  max_monthly_jobs?: number;
};

interface PermissionsProps {
  ws: Workspace | null;
  members: Member[];
  perms: WSPermission[];
  userRole: string;
  canManageMembers: boolean;
  onShowMsg: (text: string, type: 'success' | 'error') => void;
  onApiSend: <T>(url: string, method: string, body?: any, contentType?: string) => Promise<T | null>;
  onSetPerms: (perms: WSPermission[]) => void;
  currentUserId?: string | number; // Add current user ID to identify own permissions
}

export default function Permissions({ 
  ws, 
  members, 
  perms, 
  userRole, 
  canManageMembers, 
  onShowMsg, 
  onApiSend, 
  onSetPerms,
  currentUserId 
}: PermissionsProps) {
  const [permSearch, setPermSearch] = useState('');
  const [selectedPerm, setSelectedPerm] = useState<WSPermission | null>(null);
  const [editPerm, setEditPerm] = useState<WSPermission | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPerms, setEditingPerms] = useState<Set<string>>(new Set()); // Track which permissions are being edited

  const memberById = useMemo(() => {
    const map = new Map<string, Member>();
    (members || []).forEach(m => map.set(m.id, m));
    return map;
  }, [members]);

  const filteredPerms = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    if (!q) return perms;
    return (perms || []).filter(p => {
      const m = memberById.get(String(p.membership));
      const s = [m?.user.username, m?.user.email, m?.role, m?.id].filter(Boolean).join(' ').toLowerCase();
      return s.includes(q);
    });
  }, [permSearch, perms, memberById]);

  function openPermDrawer(p: WSPermission) {
    setSelectedPerm(p);
    setEditPerm({ ...p });
    setDrawerOpen(true);
    setEditingPerms(prev => new Set(prev).add(p.id)); // Mark as being edited
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedPerm(null);
    setEditPerm(null);
    if (selectedPerm) {
      setEditingPerms(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedPerm.id);
        return newSet;
      });
    }
  }

  function updateEdit<K extends keyof WSPermission>(k: K, v: WSPermission[K]) {
    setEditPerm(prev => (prev ? { ...prev, [k]: v } as WSPermission : prev));
  }

  // Check if the permission belongs to the current user
  function isCurrentUserPermission(perm: WSPermission): boolean {
    if (!currentUserId) return false;
    const m = memberById.get(String(perm.membership));
    return m && String(m.user.id) === String(currentUserId);
  }

  // Safe permission check - prevents sending requests that would cause backend errors
  function canModifyPermission(perm: WSPermission): { canModify: boolean; reason?: string } {
    // Check if user has management permissions
    if (!canManageMembers) {
      return { canModify: false, reason: 'You do not have permission to modify permissions' };
    }
    
    // Check if this is the current user's permission
    if (isCurrentUserPermission(perm)) {
      return { canModify: false, reason: 'You cannot modify your own permissions' };
    }
    
    // Check if member exists
    const member = memberById.get(String(perm.membership));
    if (!member) {
      return { canModify: false, reason: 'Member not found' };
    }
    
    // Check if member is active
    if (!member.is_active) {
      return { canModify: false, reason: 'Cannot modify permissions for inactive members' };
    }
    
    return { canModify: true };
  }

  // Check if permission can be edited (for Edit button)
  function canEditPermission(perm: WSPermission): boolean {
    // Check if user has management permissions
    if (!canManageMembers) {
      return false;
    }
    
    // Check if this is the current user's permission
    if (isCurrentUserPermission(perm)) {
      return false;
    }
    
    // Check if member exists and is active
    const member = memberById.get(String(perm.membership));
    if (!member || !member.is_active) {
      return false;
    }
    
    return true;
  }

  // Check if permission can be saved (for Save button)
  function canSavePermission(perm: WSPermission): boolean {
    // Must be able to edit AND be in editing state
    return canEditPermission(perm) && editingPerms.has(perm.id);
  }

  const ROLE_DEFAULTS: Record<Member['role'], Partial<WSPermission>> = {
    owner: {
      can_view_library: true, can_upload_assets: true, can_generate_variants: true, can_edit_variants: true, can_approve_variants: true, can_export_data: true,
      can_manage_users: true, can_manage_settings: true, can_manage_invitations: true, can_view_audit_logs: true,
      can_view_billing: true, can_manage_billing: true, can_update_token_balance: true,
      can_delete_workspace: true, can_transfer_ownership: true,
    },
    admin: {
      can_view_library: true, can_upload_assets: true, can_generate_variants: true, can_edit_variants: true, can_approve_variants: true, can_export_data: true,
      can_manage_users: true, can_manage_settings: true, can_manage_invitations: true, can_view_audit_logs: true,
      can_view_billing: true, can_manage_billing: false, can_update_token_balance: false,
      can_delete_workspace: false, can_transfer_ownership: false,
    },
    member: {
      can_view_library: true, can_upload_assets: true, can_generate_variants: true, can_edit_variants: true, can_approve_variants: false, can_export_data: true,
      can_manage_users: false, can_manage_settings: false, can_manage_invitations: false, can_view_audit_logs: false,
      can_view_billing: false, can_manage_billing: false, can_update_token_balance: false,
      can_delete_workspace: false, can_transfer_ownership: false,
    },
    viewer: {
      can_view_library: true, can_upload_assets: false, can_generate_variants: false, can_edit_variants: false, can_approve_variants: false, can_export_data: true,
      can_manage_users: false, can_manage_settings: false, can_manage_invitations: false, can_view_audit_logs: false,
      can_view_billing: false, can_manage_billing: false, can_update_token_balance: false,
      can_delete_workspace: false, can_transfer_ownership: false,
    },
  };

  function resetToRoleDefault(p: WSPermission) {
    const m = memberById.get(String(p.membership));
    if (!m) return;
    const template = ROLE_DEFAULTS[m.role];
    const next: WSPermission = { ...p, ...template };
    setEditPerm(next);
  }

  // Validate permission data before sending to backend
  function validatePermissionData(perm: WSPermission): { isValid: boolean; errorMessage?: string } {
    // Check if permission ID exists
    if (!perm.id) {
      return { isValid: false, errorMessage: 'Invalid permission ID' };
    }
    
    // Check if membership exists
    if (!perm.membership) {
      return { isValid: false, errorMessage: 'Invalid membership reference' };
    }
    
    // Check if member exists in our data
    const member = memberById.get(String(perm.membership));
    if (!member) {
      return { isValid: false, errorMessage: 'Member not found' };
    }
    
    // Check if user has permission to modify this permission
    if (!canManageMembers) {
      return { isValid: false, errorMessage: 'You do not have permission to modify permissions' };
    }
    
    // Check if this is the current user's permission
    if (isCurrentUserPermission(perm)) {
      return { isValid: false, errorMessage: 'You cannot modify your own permissions' };
    }
    
    // Check if permission is in editing state
    if (!editingPerms.has(perm.id)) {
      return { isValid: false, errorMessage: 'Please click Edit first before saving' };
    }
    
    return { isValid: true };
  }

  async function savePerm(perm: WSPermission) {
    if (!ws) return;
    
    // Use the safer permission check
    const permissionCheck = canModifyPermission(perm);
    if (!permissionCheck.canModify) {
      onShowMsg(permissionCheck.reason || 'Cannot modify this permission', 'error');
      return;
    }
    
    // Frontend validation to prevent backend errors
    const validation = validatePermissionData(perm);
    if (!validation.isValid) {
      onShowMsg(validation.errorMessage || 'Invalid permission data', 'error');
      return;
    }
    
    // Additional safety check: ensure we have all required data
    if (!perm.id || !perm.membership || !ws.id) {
      onShowMsg('Missing required data for permission update', 'error');
      return;
    }
    
    try {
      // Create a clean permission object with only the necessary fields
      // Exclude fields that might cause backend issues
      const cleanPermData = {
        can_view_library: perm.can_view_library,
        can_upload_assets: perm.can_upload_assets,
        can_generate_variants: perm.can_generate_variants,
        can_edit_variants: perm.can_edit_variants,
        can_approve_variants: perm.can_approve_variants,
        can_export_data: perm.can_export_data,
        can_manage_users: perm.can_manage_users,
        can_manage_settings: perm.can_manage_settings,
        can_manage_invitations: perm.can_manage_invitations,
        can_view_audit_logs: perm.can_view_audit_logs,
        can_view_billing: perm.can_view_billing,
        can_manage_billing: perm.can_manage_billing,
        can_update_token_balance: perm.can_update_token_balance,
        can_delete_workspace: perm.can_delete_workspace,
        can_transfer_ownership: perm.can_transfer_ownership,
        max_upload_size_mb: perm.max_upload_size_mb,
        max_monthly_jobs: perm.max_monthly_jobs
      };
      
      // Additional safety: validate the data one more time
      const member = memberById.get(String(perm.membership));
      if (!member || !member.is_active) {
        onShowMsg('Cannot modify permissions for inactive or non-existent members', 'error');
        return;
      }
      
      const updated = await onApiSend<WSPermission>(`/api/workspaces/${ws.id}/permissions/${perm.id}/`, 'PATCH', cleanPermData);
      if (updated) {
        onShowMsg('Permission saved', 'success');
        onSetPerms(perms.map(p => (p.id === perm.id ? updated : p)));
        if (selectedPerm && selectedPerm.id === perm.id) {
          setSelectedPerm(updated);
          setEditPerm(updated);
        }
        // Remove from editing set
        setEditingPerms(prev => {
          const newSet = new Set(prev);
          newSet.delete(perm.id);
          return newSet;
        });
      } else {
        onShowMsg('Failed to save permission. No response from server.', 'error');
      }
    } catch (error) {
      console.error('Permission save error:', error);
      // Provide more specific error messages based on error type
      if (error instanceof Error) {
        if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
          onShowMsg('Server error occurred. Please try again later.', 'error');
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          onShowMsg('You do not have permission to perform this action.', 'error');
        } else if (error.message.includes('404') || error.message.includes('Not Found')) {
          onShowMsg('Permission not found. Please refresh the page.', 'error');
        } else {
          onShowMsg('Failed to save permission. Please try again.', 'error');
        }
      } else {
        onShowMsg('Failed to save permission. Please try again.', 'error');
      }
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Permissions</h1>
        {ws && <span className="muted">Workspace: {ws.name}</span>}
      </header>

      <section className="card">
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Permission Matrix</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input 
              className="input" 
              placeholder="Search by username / email / role" 
              value={permSearch} 
              onChange={(e) => setPermSearch(e.target.value)} 
              style={{ width:280 }} 
            />
          </div>
        </div>

        {perms.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <p>No permissions configured yet.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th title="View library">👁 View</th>
                <th title="Upload assets">⬆️ Upload</th>
                <th title="Generate variants">🪄 Generate</th>
                <th title="Export data">📤 Export</th>
                <th title="Manage users">👤⚙️ Users</th>
                <th title="Manage settings">🛠 Settings</th>
                <th title="Manage billing (Owner only)">💳 Billing</th>
                <th title="Critical (Owner only): Delete/Transfer">⚠️ Critical</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPerms.map((p) => {
                const m = memberById.get(String(p.membership));
                const disabledAll = !canManageMembers;
                const disabledSensitive = userRole !== 'owner' || disabledAll;
                const isBeingEdited = editingPerms.has(p.id);
                const isCurrentUser = isCurrentUserPermission(p);
                const canEdit = canEditPermission(p);
                const canSave = canSavePermission(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display:'flex', flexDirection:'column' }}>
                        <b>{m?.user.username || '—'}</b>
                        <span className="muted" style={{ fontSize:12 }}>{m?.user.email || '—'}</span>
                      </div>
                    </td>
                    <td><span className="badge">{m?.role || '—'}</span></td>
                    <td>{p.can_view_library ? '✅' : '—'}</td>
                    <td>
                      <input 
                        type="checkbox" 
                        disabled={!canSave} 
                        checked={!!p.can_upload_assets} 
                        onChange={(e)=> onSetPerms(perms.map(x => x.id===p.id? { ...x, can_upload_assets: e.target.checked }: x))} 
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        disabled={!canSave} 
                        checked={!!p.can_generate_variants} 
                        onChange={(e)=> onSetPerms(perms.map(x => x.id===p.id? { ...x, can_generate_variants: e.target.checked }: x))} 
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        disabled={!canSave} 
                        checked={!!p.can_export_data} 
                        onChange={(e)=> onSetPerms(perms.map(x => x.id===p.id? { ...x, can_export_data: e.target.checked }: x))} 
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        disabled={!canSave} 
                        checked={!!p.can_manage_users} 
                        onChange={(e)=> onSetPerms(perms.map(x => x.id===p.id? { ...x, can_manage_users: e.target.checked }: x))} 
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        disabled={!canSave} 
                        checked={!!p.can_manage_settings} 
                        onChange={(e)=> onSetPerms(perms.map(x => x.id===p.id? { ...x, can_manage_settings: e.target.checked }: x))} 
                      />
                    </td>
                    <td title={disabledSensitive? 'Only owners may grant billing permissions' : ''}>
                      <input 
                        type="checkbox" 
                        disabled={disabledSensitive || !canSave} 
                        checked={!!p.can_manage_billing} 
                        onChange={(e)=> onSetPerms(perms.map(x => x.id===p.id? { ...x, can_manage_billing: e.target.checked }: x))} 
                      />
                    </td>
                    <td title={disabledSensitive? 'Only owners may grant critical permissions' : ''}>
                      {(p.can_delete_workspace || p.can_transfer_ownership) ? '⚠️' : '—'}
                    </td>
                    <td className="actions">
                      <button className="ghost" onClick={()=>openPermDrawer(p)} disabled={!canEdit}>Edit</button>
                      <button className="primary small" onClick={()=>savePerm(p)} disabled={!canSave}>Save</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Drawer */}
      {drawerOpen && selectedPerm && editPerm && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer" onClick={(e)=>e.stopPropagation()}>
            {(() => { const m = memberById.get(String(selectedPerm.membership)); return (
              <header className="drawer-head">
                <div>
                  <div style={{fontWeight:800, fontSize:18}}>{m?.user.username || 'Member'}</div>
                  <div className="muted" style={{marginTop:2}}>{m?.user.email || '—'}</div>
                </div>
                <span className="badge">{m?.role || '—'}</span>
              </header>
            ); })()}

            <div className="drawer-body">
              {/* Content & Library */}
              <div className="perm-group">
                <div className="perm-title">Content & Library</div>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_view_library} onChange={(e)=>updateEdit('can_view_library', e.target.checked)} /> View library
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_upload_assets} onChange={(e)=>updateEdit('can_upload_assets', e.target.checked)} /> Upload assets
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_generate_variants} onChange={(e)=>updateEdit('can_generate_variants', e.target.checked)} /> Generate variants
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_edit_variants} onChange={(e)=>updateEdit('can_edit_variants', e.target.checked)} /> Edit variants
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_approve_variants} onChange={(e)=>updateEdit('can_approve_variants', e.target.checked)} /> Approve variants
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_export_data} onChange={(e)=>updateEdit('can_export_data', e.target.checked)} /> Export data
                </label>

                <div className="grid2" style={{marginTop:8}}>
                  <div>
                    <div className="muted">Max upload size (MB)</div>
                    <input 
                      className="input" 
                      type="number" 
                      min={1} 
                      value={editPerm.max_upload_size_mb ?? 10} 
                      onChange={(e)=>updateEdit('max_upload_size_mb', parseInt(e.target.value||'0',10))} 
                    />
                  </div>
                  <div>
                    <div className="muted">Max monthly jobs</div>
                    <input 
                      className="input" 
                      type="number" 
                      min={0} 
                      value={editPerm.max_monthly_jobs ?? 0} 
                      onChange={(e)=>updateEdit('max_monthly_jobs', parseInt(e.target.value||'0',10))} 
                    />
                  </div>
                </div>
              </div>

              {/* Administrative */}
              <div className="perm-group">
                <div className="perm-title">Administrative</div>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_manage_users} onChange={(e)=>updateEdit('can_manage_users', e.target.checked)} disabled={!canManageMembers} /> Manage users
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_manage_settings} onChange={(e)=>updateEdit('can_manage_settings', e.target.checked)} disabled={!canManageMembers} /> Manage settings
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_manage_invitations} onChange={(e)=>updateEdit('can_manage_invitations', e.target.checked)} disabled={!canManageMembers} /> Manage invitations
                </label>
                <label className="perm-item">
                  <input type="checkbox" checked={!!editPerm.can_view_audit_logs} onChange={(e)=>updateEdit('can_view_audit_logs', e.target.checked)} disabled={!canManageMembers} /> View audit logs
                </label>
              </div>

              {/* Billing */}
              <div className="perm-group">
                <div className="perm-title">Billing</div>
                <label className="perm-item" title={userRole!=='owner'?'Only owners may grant billing permissions':''}>
                  <input type="checkbox" checked={!!editPerm.can_view_billing} onChange={(e)=>updateEdit('can_view_billing', e.target.checked)} disabled={!canManageMembers} /> View billing
                </label>
                <label className="perm-item" title={userRole!=='owner'?'Only owners may grant billing permissions':''}>
                  <input type="checkbox" checked={!!editPerm.can_manage_billing} onChange={(e)=>updateEdit('can_manage_billing', e.target.checked)} disabled={userRole!=='owner'} /> Manage billing
                </label>
                <label className="perm-item" title={userRole!=='owner'?'Only owners may grant billing permissions':''}>
                  <input type="checkbox" checked={!!editPerm.can_update_token_balance} onChange={(e)=>updateEdit('can_update_token_balance', e.target.checked)} disabled={userRole!=='owner'} /> Update token balance
                </label>
              </div>

              {/* Critical */}
              <div className="perm-group danger">
                <div className="perm-title">Critical Operations</div>
                <label className="perm-item" title={userRole!=='owner'?'Only owners may grant critical permissions':''}>
                  <input type="checkbox" checked={!!editPerm.can_delete_workspace} onChange={(e)=>updateEdit('can_delete_workspace', e.target.checked)} disabled={userRole!=='owner'} /> Delete workspace
                </label>
                <label className="perm-item" title={userRole!=='owner'?'Only owners may grant critical permissions':''}>
                  <input type="checkbox" checked={!!editPerm.can_transfer_ownership} onChange={(e)=>updateEdit('can_transfer_ownership', e.target.checked)} disabled={userRole!=='owner'} /> Transfer ownership
                </label>
              </div>
            </div>

            <footer className="drawer-foot">
              <button className="ghost" onClick={()=> selectedPerm && resetToRoleDefault(selectedPerm)} disabled={!canManageMembers || (selectedPerm && isCurrentUserPermission(selectedPerm))}>Reset to Role Default</button>
              <div style={{flex:1}} />
              <button className="ghost" onClick={closeDrawer}>Cancel</button>
              <button className="primary" onClick={()=>{ if (editPerm) savePerm(editPerm); closeDrawer(); }} disabled={!canManageMembers || (selectedPerm && isCurrentUserPermission(selectedPerm))}>Save Changes</button>
            </footer>
          </div>
        </div>
      )}

      <style jsx>{`
        .page-header { display:flex; align-items:center; gap:16px; margin:6px 6px 16px; }
        .card { background:#faf5ff; border-radius:16px; padding:16px; margin:10px 6px 16px; border:2px solid #f3e8ff; }
        .card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .primary.small { padding:8px 12px; font-size:13px; }
        .primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
        .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        .input { width:100%; padding:12px 14px; border:2px solid #fce7f3; border-radius:12px; background:#fff; }
        .grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        @media (max-width: 900px) { .grid2 { grid-template-columns:1fr; } }
        .muted { color:#6b7280; font-size:12px; }
        .table { width:100%; border-collapse:separate; border-spacing:0; }
        .table th, .table td { text-align:left; padding:10px 8px; border-bottom: 1px dashed #e9d5ff; vertical-align: middle; }
        .table th { font-size:12px; color:#6b7280; font-weight:600; }
        .actions { display:flex; gap:8px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
          background: linear-gradient(135deg, #fce7f3, #fef3c7); color: #92400e; }
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
    </>
  );
}
