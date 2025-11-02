// app/invite/[token]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appendAuthHeaders, redirectToAuthWithNext, verifySession } from '@/lib/authHelpers';

type ValidateResp = {
  workspace?: string;
  workspace_name?: string;
  role?: 'viewer' | 'member' | 'admin';
  invitation_id?: string;
  error?: string;
};

type AcceptResp = {
  message?: string;
  workspace?: {
    id: string;
    name: string;
    description?: string;
  };
  membership?: {
    role: string;
    assigned_at: string;
  };
  invitation?: {
    name?: string;
    created_by?: string;
  };
  error?: string;
};

export default function PublicInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { token } = params;
  const [loading, setLoading] = useState(true);
  const [v, setV] = useState<ValidateResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<AcceptResp | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  async function readJsonSafely<T>(response: Response): Promise<T | null> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch (parseError) {
      console.warn('Expected JSON but received:', text.slice(0, 200));
      return null;
    }
  }

  async function validate() {
    setLoading(true);
    setErr(null);
    setIsAuthed(false);
    setAccepted(null);
    setV(null);
    try {
      console.log('Validating token:', token);
      const authed = await verifySession();
      if (!authed) {
        setErr('Your session is missing or has expired. Please sign in and try again. Redirecting…');
        redirectToAuthWithNext(800);
        return;
      }
      setIsAuthed(true);

      const r = await fetch('/api/invite/validate_token/', {
        method: 'POST',
        credentials: 'include',
        headers: appendAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ token }),
      });
      console.log('Validation response status:', r.status);
      if (r.status === 401) {
        setErr('Your session is missing or has expired. Please sign in and try again. Redirecting…');
        setV(null);
        redirectToAuthWithNext(800);
        return;
      }

      const data = await readJsonSafely<ValidateResp & { details?: unknown }>(r);
      if (!r.ok) {
        const detailText = data?.details ? ` (${JSON.stringify(data.details)})` : '';
        setErr(data?.error || `Invalid or expired invitation.${detailText}`);
        setV(null);
        return;
      }

      setV(data);
      setErr(null);
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
      console.log('Accepting invitation with token:', token);
      const r = await fetch('/api/invite/accept_invitation/', {
        method: 'POST',
        credentials: 'include',
        headers: appendAuthHeaders({ 'content-type': 'application/json' }, { includeCsrf: true }),
        body: JSON.stringify({ token }),
      });
      console.log('Accept response status:', r.status);
      if (r.status === 401) {
        setErr('Please sign in first. Redirecting to login…');
        redirectToAuthWithNext(800);
        return;
      }
      if (r.status === 403) {
        setErr('Failed to accept invitation. Please ensure the link is still valid.');
        return;
      }
      const data = await readJsonSafely<AcceptResp & { details?: unknown }>(r);
      if (!r.ok) {
        const detailText = data?.details ? ` (${JSON.stringify(data.details)})` : '';
        setErr(data?.error || data?.message || `Failed to accept invitation.${detailText}`);
        setAccepted(null);
        return;
      }

      setAccepted(data);
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
            {v.workspace_name ? (
              <div className="ok">
                <div className="line"><b>Workspace:</b> {v.workspace_name}</div>
                <div className="line"><b>Role to grant:</b> {v.role}</div>

                {!isAuthed ? (
                  <div className="muted">Please sign in to accept this invitation.</div>
                ) : !accepted ? (
                  <button className="primary" onClick={accept} disabled={accepting}>
                    {accepting ? 'Joining…' : 'Accept & Join'}
                  </button>
                ) : (
                  <div className="success">
                    <div>🎉 Joined successfully{accepted.workspace?.name ? `: ${accepted.workspace.name}` : ''}!</div>
                    <div className="row">
                      {/* Redirect to workspace management page */}
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
                {v.error && <div className="muted">Reason: {v.error}</div>}
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
