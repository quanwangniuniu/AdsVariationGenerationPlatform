/*
// components/invite/[token]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type ValidateResp = {
  valid: boolean;
  workspace_name?: string;
  role?: 'viewer' | 'member' | 'admin';
  invitation_name?: string | null;
  description?: string | null;
  reason?: string; // e.g. expired / deactivated / exceeded / invalid
};

type AcceptResp = {
  success: boolean;
  message?: string;
  workspace_id?: string | number;
  workspace_name?: string;
};

export default function PublicInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { token } = params;
  const [loading, setLoading] = useState(true);
  const [v, setV] = useState<ValidateResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<AcceptResp | null>(null);

  async function validate() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/workspaces/invite/validate_token/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (r.status === 401) {
        setErr('You need to sign in to proceed.');
        setV(null);
      } else {
        const data = (await r.json()) as ValidateResp;
        setV(data);
        if (!data.valid && !data.reason) setErr('Invalid or expired invitation.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Network error');
      setV(null);
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    setAccepting(true);
    setErr(null);
    try {
      const r = await fetch('/api/workspaces/invite/accept_invitation/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (r.status === 401) {
        setErr('Please sign in first. Redirecting to login…');
        // Use window.location for immediate redirect (synchronous)
        const nextUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
        setTimeout(() => { window.location.href = `/auth?next=${nextUrl}`; }, 800);
        return;
      }
      const data = (await r.json()) as AcceptResp;
      if (!r.ok || !data.success) {
        setErr(data.message || 'Failed to accept invitation.');
        setAccepted(null);
      } else {
        setAccepted(data);
      }
    } catch (e: any) {
      setErr(e?.message || 'Network error');
      setAccepted(null);
    } finally {
      setAccepting(false);
    }
  }

  useEffect(() => {
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="wrap">
      <div className="card">
        <h1 className="title">Workspace Invitation</h1>

        {loading && <div className="muted">Validating…</div>}

        {!loading && v && (
          <>
            {v.valid ? (
              <div className="ok">
                <div className="line"><b>Workspace:</b> {v.workspace_name || '—'}</div>
                <div className="line"><b>Role to grant:</b> {v.role}</div>
                <div className="line"><b>Invitation:</b> {v.invitation_name || '—'}</div>
                {v.description && <div className="desc">{v.description}</div>}

                {!accepted ? (
                  <button className="primary" onClick={accept} disabled={accepting}>
                    {accepting ? 'Joining…' : 'Accept & Join'}
                  </button>
                ) : (
                  <div className="success">
                    <div>🎉 Joined successfully{accepted.workspace_name ? `: ${accepted.workspace_name}` : ''}!</div>
                    <div className="row">
                      {/!* 如果你的 Workspace 详情路径不同，替换这里 *!/}
                      <button className="ghost" onClick={() => router.push('/workspace')}>
                        Go to Workspace
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bad">
                <div className="line">This invitation is not valid.</div>
                {v.reason && <div className="muted">Reason: {v.reason}</div>}
              </div>
            )}
          </>
        )}

        {!loading && err && (
          <div className="error">{err}</div>
        )}

        {!loading && !v && !err && (
          <div className="muted">No data.</div>
        )}
      </div>

      <style jsx>{`
        .wrap { min-height: 100vh; display:flex; align-items:center; justify-content:center;
          padding: 24px; background: linear-gradient(135deg, #fdf2f8, #fef7ed, #f3e8ff); font-family:'Inter',sans-serif; }
        .card { width: 680px; max-width: 94vw; background: #fff; border: 2px solid #f3e8ff; border-radius: 20px; padding: 24px;
          box-shadow: 0 8px 24px rgba(236,72,153,.12), 0 2px 8px rgba(139,69,19,.06); }
        .title { margin: 0 0 12px; }
        .line { margin: 8px 0; }
        .desc { margin: 12px 0; color: #374151; }
        .ok { padding: 6px 0 0; }
        .bad { padding: 12px 0; color: #991b1b; }
        .muted { color:#6b7280; font-size:14px; }
        .error { margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid #fca5a5; background:#fee2e2; color:#991b1b; }
        .success { margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid #86efac; background:#d1fae5; color:#065f46; }
        .row { display:flex; gap:8px; margin-top:8px; }
        .primary { padding:10px 14px; border-radius:12px; border:none; background: linear-gradient(135deg,#f9a8d4,#fbbf24,#c084fc); color:#fff; font-weight:700; cursor:pointer; }
        .ghost { padding:8px 12px; border-radius:12px; border:2px solid #f3e8ff; background:#fff; color:#6b7280; font-weight:600; cursor:pointer; }
      `}</style>
    </div>
  );
}
*/
