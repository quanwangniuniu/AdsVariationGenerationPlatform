// components/ProfilePage.tsx
'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveUser, getUser, clearUser } from '../lib/userStorage';
import { appendAuthHeaders, getCsrfTokenFromCookie, headersInitToRecord, redirectToAuthWithNext } from '@/lib/authHelpers';
import Navbar from './navbar/Navbar';


type User = {
  id: number | string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  bio?: string;
  location?: string;
  birth_date?: string;
  website?: string;
  avatar?: string;
  gender?: 'M' | 'F' | 'O' | '';
  created_at?: string;
  updated_at?: string;
};

type Workspace = {
  id: number | string;
  name: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  type?: 'standard' | 'demo' | 'enterprise';
  max_users?: number;
  max_storage_gb?: number;
};

type Message = { text: string; type: 'success' | 'error' } | null;

const API_BASE_URL = '/api/account';

/**
 * UI-only mirror for plan labels/prices/features.
 * Real pricing/limits should come from your billing/subscription backend.
 * Current workspace limits are read from the workspace API.
 */
const PLAN_CONFIG: Record<
  Workspace['plan'],
  {
    label: string;
    monthlyUSD?: number;
    features: string[];
    limits: (ws?: Workspace) => string[];
  }
> = {
  free: {
    label: 'Free',
    monthlyUSD: 0,
    features: ['Basic access', 'Community support'],
    limits: (ws) => [
      `Up to ${ws?.max_users ?? 1} members`,
      `${ws?.max_storage_gb ?? 1} GB storage`,
    ],
  },
  basic: {
    label: 'Plus',
    monthlyUSD: 20, // demo price for UI
    features: ['Extended limits', 'Priority queue'],
    limits: (ws) => [
      `Up to ${ws?.max_users ?? 5} members`,
      `${ws?.max_storage_gb ?? 10} GB storage`,
    ],
  },
  pro: {
    label: 'Pro',
    monthlyUSD: 200, // demo price for UI
    features: ['Higher quotas', 'Faster processing'],
    limits: (ws) => [
      `Up to ${ws?.max_users ?? 20} members`,
      `${ws?.max_storage_gb ?? 100} GB storage`,
    ],
  },
  enterprise: {
    label: 'Business',
    monthlyUSD: 25, // demo price for UI
    features: ['SSO / MFA', 'Admin controls', 'Data & audit controls'],
    limits: () => ['Team-sized members', 'Team storage (policy-based)'],
  },
};

type LeftTab = 'profile' | 'account' | 'upgrade';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('profile');

  function showMsg(text: string, type: 'success' | 'error') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  const fullName = useMemo(() => {
    const first = (user?.first_name ?? '').trim();
    const last = (user?.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    return full || (user?.username ?? '');
  }, [user]);

  function buildHeaders(includeCsrf = false, extra?: HeadersInit) {
    const base: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headersInitToRecord(extra),
    };
    if (includeCsrf) {
      const token = getCsrfTokenFromCookie();
      if (token) {
        base['X-CSRFToken'] = token;
      }
    }
    return appendAuthHeaders(base, { includeCsrf });
  }

  // Go to Workspace
  function goWorkspace() {
    router.push('/workspace');
  }

  async function apiCall<T = any>(endpoint: string, init?: RequestInit): Promise<T> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = buildHeaders(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method), init?.headers);

    const { headers: _ignored, ...restInit } = init ?? {};
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'follow',
      credentials: 'include',
      ...restInit,
    });
    let payload: any = null;
    try { payload = await res.json(); } catch {}
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        redirectToAuthWithNext();
      }
      return (payload ?? { success: false, message: res.statusText }) as T;
    }
    return payload as T;
  }

  function joinErrors(errs: Record<string, string[]>) {
    return Object.entries(errs).map(([f, arr]) => `${f}: ${arr.join(', ')}`).join('; ');
  }

  /**
   * Load current user from localStorage or server
   */
  useEffect(() => {
    (async () => {
      // Try to get user information from localStorage first
      const cachedUser = getUser();
      if (cachedUser) {
        setUser(cachedUser as User);
        return;
      }

      // If there is no user information in localStorage, get it from the server
      const [verifyRes, profileRes] = await Promise.allSettled([
        apiCall('/verify',  { method: 'GET' }),
        apiCall('/profile/', { method: 'GET' }),
      ]);

      const v = verifyRes.status === 'fulfilled' ? (verifyRes.value as any) : null;
      if (!v?.success) {
        redirectToAuthWithNext();
        return;
      }

      const p = profileRes.status === 'fulfilled' ? (profileRes.value as any) : null;
      const userPayload = (p?.success && p?.user) ? p.user : (v?.user || null);

      if (userPayload) {
        setUser(userPayload);
        // Save to localStorage
        saveUser(userPayload as any);
      } else {
        redirectToAuthWithNext();
        return;
      }

    })();
  }, [router]);

  const avatarCh = useMemo(() => (fullName || 'U').charAt(0).toUpperCase(), [fullName]);

  // Update profile (PATCH only non-empty fields)
  async function onUpdateProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);

    const payload: Record<string, any> = {};

    // Extract all form fields
    const email = String(fd.get('email') ?? '').trim();
    const first_name = String(fd.get('first_name') ?? '').trim();
    const last_name = String(fd.get('last_name') ?? '').trim();
    const phone = String(fd.get('phone') ?? '').trim();
    const bio = String(fd.get('bio') ?? '').trim();
    const location = String(fd.get('location') ?? '').trim();
    const website = String(fd.get('website') ?? '').trim();
    const gender = String(fd.get('gender') ?? '').trim();
    const birth_date = String(fd.get('birth_date') ?? '').trim();

    // Only include non-empty fields
    if (email) payload.email = email;
    if (first_name) payload.first_name = first_name;
    if (last_name) payload.last_name = last_name;
    if (phone) payload.phone = phone;
    if (bio) payload.bio = bio;
    if (location) payload.location = location;
    if (website) payload.website = website;
    if (gender) payload.gender = gender;
    if (birth_date) payload.birth_date = birth_date;

    setLoading(true);
    const r: any = await apiCall('/profile/update/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    setLoading(false);

    if (r?.success) {
      if (r.user) {
        setUser(r.user);
        // Update user information in localStorage
        saveUser(r.user as any);
      }
      setIsEditing(false);
      showMsg('Profile updated successfully!', 'success');
    } else if (r?.errors) {
      showMsg(joinErrors(r.errors), 'error');
    } else {
      showMsg(r?.message || 'Failed to update profile.', 'error');
    }
  }

  // Change password with lightweight client-side checks
  async function onChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);

    const old_password = String(fd.get('old_password') ?? '');
    const new_password = String(fd.get('new_password') ?? '');
    const new_password_confirm = String(fd.get('new_password_confirm') ?? '');

    // Client-side checks to reduce invalid requests
    if (!old_password || !new_password || !new_password_confirm) {
      showMsg('Please fill in all password fields.', 'error');
      return;
    }
    if (new_password !== new_password_confirm) {
      showMsg('New passwords do not match.', 'error');
      return;
    }
    if (new_password === old_password) {
      showMsg('New password must be different from the old password.', 'error');
      return;
    }
    if (new_password.length < 8) {
      showMsg('New password must be at least 8 characters long.', 'error');
      return;
    }
    if (/^\d+$/.test(new_password)) {
      showMsg('New password cannot be entirely numeric.', 'error');
      return;
    }

    setLoading(true);
    const r: any = await apiCall('/password/change/', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password, new_password_confirm }),
      cache: 'no-store',
    });
    setLoading(false);

    if (r?.success) {
      setShowPwd(false);
      showMsg('Password changed successfully!', 'success');
      form.reset();
    } else if (r?.errors) {
      showMsg(joinErrors(r.errors), 'error');
    } else {
      showMsg(r?.message || 'Failed to change password.', 'error');
    }
  }

  async function onLogout() {
    try {
      const r: any = await apiCall('/logout/', { method: 'POST' });
      if (!r?.success) console.warn('[logout] backend non-success:', r);
      // Clear user data from storage
      clearUser();
    } catch (err) {
      console.warn('[logout] request error:', err);
    } finally {
      redirectToAuthWithNext();
    }
  }

  /**
   * Placeholder upgrade action.
   * IMPORTANT: Workspace.plan should be changed via billing/subscription flow (not direct PATCH here).
   */
  function handleUpgrade(targetPlan: Workspace['plan']) {
    if (!workspace) return;
    showMsg(`Ready to upgrade to ${PLAN_CONFIG[targetPlan].label}. Connect your billing checkout flow.`, 'success');
    // Example: router.push(`/billing/checkout?workspace=${workspace.id}&plan=${targetPlan}`);
  }

  if (!user) {
    return (
      <div className="layout">
        <div className="loading">Loading…</div>
        <style jsx>{`
          .layout { min-height:100vh; display:flex; align-items:center; justify-content:center;
            background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%); }
          .loading { font-family: 'Inter', sans-serif; color:#6b7280; }
        `}</style>
      </div>
    );
  }

  return (
    // <>
    //  <Navbar />

    <div className="layout">
      {/* Left sidebar */}
      <aside className="sidebar">
        {/* Navigation Section */}
        <div className="section-title">Navigation</div>
        <nav className="menu">
          <button
            className="item"
            onClick={() => router.push('/search')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Search
          </button>
          <button
            className="item"
            onClick={() => router.push('/library')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Library
          </button>
          <button
            className="item"
            onClick={() => router.push('/templates')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Templates
          </button>
          <button className="item" onClick={goWorkspace}>
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Workspace
          </button>
          <button
            className="item"
            onClick={() => router.push('/history')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            History
          </button>
        </nav>

        {/* User Settings Section */}
        <div className="section-title">User Settings</div>
        <nav className="menu">
          <button
            className={`item ${leftTab === 'profile' ? 'active' : ''}`}
            onClick={() => setLeftTab('profile')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Personal Info
          </button>
          <button
            className={`item ${leftTab === 'account' ? 'active' : ''}`}
            onClick={() => setLeftTab('account')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Account Settings
          </button>
        </nav>

        {/* Billing Section */}
        <div className="section-title">Billing</div>
        <nav className="menu">
          <button
            className="item"
            onClick={() => router.push('/billing')}
          >
            <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            Personal Billing
          </button>
        </nav>

        {/* Logout Section */}
        <div className="section-title">Log Out</div>
        <nav className="menu">
          <button
            className="item"
            onClick={onLogout}
          >
           <svg className="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Log Out
          </button>
        </nav>
      </aside>

      {/* Right content area */}
      <main className="content">
        {leftTab === 'profile' ? (
          <>
            <header className="page-header">
              <h1>Personal Information</h1>
              <p className="page-subtitle">Manage your personal details and contact information</p>
            </header>

            {/* Profile Info Card */}
            {!isEditing ? (
              <section className="card profile-info-card">
                <div className="profile-banner">
                  <div className="avatar-large">{avatarCh}</div>
                  <div className="profile-name-section">
                    <h2 className="profile-display-name">{fullName || user.username}</h2>
                    <p className="profile-username">@{user.username}</p>
                    <span className="profile-badge">Member since {new Date(user.created_at || '').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="spacer" />
                  <button className="btn-edit-profile" onClick={() => setIsEditing(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Profile
                  </button>
                </div>

                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Email Address</div>
                      <div className="info-value">{user.email}</div>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Full Name</div>
                      <div className="info-value">{fullName || 'Not set'}</div>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Phone Number</div>
                      <div className="info-value">{user.phone || 'Not set'}</div>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Location</div>
                      <div className="info-value">{user.location || 'Not set'}</div>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Gender</div>
                      <div className="info-value">
                        {user.gender === 'M' ? 'Male' : user.gender === 'F' ? 'Female' : user.gender === 'O' ? 'Other' : 'Not set'}
                      </div>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Birth Date</div>
                      <div className="info-value">
                        {user.birth_date ? new Date(user.birth_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set'}
                      </div>
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </div>
                    <div className="info-content">
                      <div className="info-label">Website</div>
                      <div className="info-value">
                        {user.website ? (
                          <a href={user.website} target="_blank" rel="noopener noreferrer" className="info-link">
                            {user.website}
                          </a>
                        ) : (
                          'Not set'
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="card edit-card">
                <div className="edit-header">
                  <h3>Edit Personal Information</h3>
                  <button className="btn-close" onClick={() => setIsEditing(false)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={onUpdateProfile} className="edit-form">
                  <div className="form-row">
                    <div className="form-field">
                      <label>Email Address</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        <input name="email" type="email" defaultValue={user.email} required />
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <label>First Name</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <input name="first_name" type="text" defaultValue={user.first_name || ''} />
                      </div>
                    </div>

                    <div className="form-field">
                      <label>Last Name</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <input name="last_name" type="text" defaultValue={user.last_name || ''} />
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <label>Phone Number</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <input name="phone" type="tel" defaultValue={user.phone || ''} placeholder="+1 234 567 8900" />
                      </div>
                    </div>

                    <div className="form-field">
                      <label>Location</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <input name="location" type="text" defaultValue={user.location || ''} placeholder="City, Country" />
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <label>Gender</label>
                      <div className="input-wrapper select-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        <select name="gender" defaultValue={user.gender || ''}>
                          <option value="">Prefer not to say</option>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="O">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-field">
                      <label>Birth Date</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <input name="birth_date" type="date" defaultValue={user.birth_date || ''} />
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <label>Website</label>
                      <div className="input-wrapper">
                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        <input name="website" type="url" defaultValue={user.website || ''} placeholder="https://example.com" />
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field full-width">
                      <label>Bio</label>
                      <div className="input-wrapper textarea-wrapper">
                        <textarea
                          name="bio"
                          defaultValue={user.bio || ''}
                          rows={4}
                          placeholder="Tell us about yourself..."
                          maxLength={500}
                        />
                      </div>
                      <div className="field-hint">Maximum 500 characters</div>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn-cancel" onClick={() => setIsEditing(false)}>
                      Cancel
                    </button>
                    <button type="submit" className={`btn-save ${loading ? 'loading' : ''}`} disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner"></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </>
        ) : leftTab === 'account' ? (
          <>
            <header className="page-header">
              <h1>Account Settings</h1>
              <p className="page-subtitle">Manage your security and account preferences</p>
            </header>

            {/* Password & verification */}
            <section className="card">
              <div className="card-head">
                <div>
                  <h3>Password & Security</h3>
                  <p className="card-subtitle">Keep your account secure by updating your password regularly</p>
                </div>
                <button className="primary outline small" onClick={() => setShowPwd(true)}>Change Password</button>
              </div>
            </section>

            {/* Logout */}
            <div className="row-end">
              <button className="danger outline" onClick={onLogout}>Log Out</button>
            </div>
          </>
        ) : (
          <>
            <header className="page-header">
              <h1>Upgrade Your Plan</h1>
            </header>

            {/* Current workspace summary */}
            <section className="card">
              <div className="grid-simple">
                <div><b>Workspace:</b> {workspace?.name ?? '—'}</div>
                <div><b>Current Plan:</b> {workspace?.plan ? PLAN_CONFIG[workspace.plan].label : '—'}</div>
                <div><b>Members limit:</b> {workspace?.max_users ?? '—'}</div>
                <div><b>Storage limit:</b> {workspace?.max_storage_gb ?? '—'} GB</div>
              </div>
            </section>

            {/* Pricing grid (cards) */}
            <section className="pricing-grid">
              {(['basic', 'pro', 'enterprise'] as Workspace['plan'][]).map((k) => {
                const cfg = PLAN_CONFIG[k];
                const isCurrent = workspace?.plan === k;
                return (
                  <div className={`plan-card card ${k === 'enterprise' ? 'plan-accent' : ''}`} key={k}>
                    <div className="plan-head">
                      <div className="plan-title">{cfg.label}</div>
                      {typeof cfg.monthlyUSD === 'number' ? (
                        <div className="plan-price">
                          ${cfg.monthlyUSD}<span className="mo">/mo</span>
                        </div>
                      ) : (
                        <div className="plan-price muted">Contact sales</div>
                      )}
                    </div>

                    <div className="plan-body">
                      <div className="plan-sec">
                        {cfg.features.map((f, i) => (<div className="line" key={i}>• {f}</div>))}
                      </div>
                      <div className="plan-sec muted">
                        {cfg.limits(workspace).map((l, i) => (<div className="line" key={i}>{l}</div>))}
                      </div>
                    </div>

                    <div className="plan-actions">
                      {isCurrent ? (
                        <button className="ghost" disabled>Current Plan</button>
                      ) : (
                        <button className="primary" onClick={() => handleUpgrade(k)}>
                          Get {cfg.label}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Additional notes */}
            <section className="card">
              <div className="notes-title">Billing & Data</div>
              <div className="notes-body">
                Plan changes should go through your billing/checkout flow. Pricing and exact limits are controlled by your backend subscription service.
              </div>
            </section>
          </>
        )}
      </main>

      {/* Change password drawer */}
      {showPwd && (
        <div className="drawer">
          <div className="drawer-inner">
            <div className="drawer-head">
              <h3>Change Password</h3>
              <button className="ghost" onClick={() => setShowPwd(false)}>Close</button>
            </div>

            {/* Human-readable password rules */}
            <div className="pw-rules">
              <strong>Password requirements</strong>
              <ul>
                <li>At least 8 characters long.</li>
                <li>Cannot be entirely numeric.</li>
                <li>Should not be too similar to your personal information.</li>
                <li>Should not be a very common password.</li>
              </ul>
              <p className="muted">More advanced checks are enforced by the server. If submission fails, please follow the error message.</p>
            </div>

            <form onSubmit={onChangePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <input name="old_password" type="password" required />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input name="new_password" type="password" required />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input name="new_password_confirm" type="password" required />
              </div>
              <div className="drawer-actions">
                <button type="button" className="ghost" onClick={() => setShowPwd(false)}>Cancel</button>
                <button type="submit" className={`primary ${loading ? 'loading' : ''}`} disabled={loading}>
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {message && <div className={`toast ${message.type}`}>{message.text}</div>}

      <style jsx>{`
        /* Layout & Base */
        .layout { min-height: 100vh; display: grid; grid-template-columns: 280px 1fr; gap: 16px; padding: 24px;
          background: #FFF7F2; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        /* Sidebar */
        .sidebar { background: rgba(255,255,255,0.95); backdrop-filter: blur(16px); border-radius: 24px; padding: 16px;
          box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15), 0 4px 12px rgba(0,0,0,0.03); display: flex; flex-direction: column; height: calc(100vh - 48px); position: sticky; top: 24px; }
        .section-title { margin: 18px 8px 10px; font-size: 12px; color:#6B7280; letter-spacing:.06em; text-transform: uppercase; font-weight: 600; }
        .menu { display: grid; gap: 6px; margin-bottom: 10px; }
        .item { display: flex; align-items: center; gap: 10px; text-align: left; padding: 12px 14px; border-radius: 16px; border: 2px solid transparent; background: transparent; cursor: pointer; color:#6B7280; font-weight: 500; transition: all 200ms ease-in-out; }
        .item:hover { background: #F7F3FF; }
        .item.active { background: linear-gradient(135deg, #FF8FAB, #FFB86B); color:#fff; box-shadow: 0 6px 18px rgba(249,168,212,.35); }
        .item-icon { width: 20px; height: 20px; }

        /* Content */
        .content { background: rgba(255,255,255,0.95); backdrop-filter: blur(16px); border-radius: 24px; padding: 32px; box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15), 0 4px 12px rgba(0,0,0,0.03); min-height: calc(100vh - 48px); }
        .page-header { margin-bottom: 24px; }
        .page-header h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 30px; font-weight: 700; color: #2D2A32; margin: 0 0 8px; }
        .page-subtitle { color: #6B7280; font-size: 14px; margin: 0; }
        .spacer { flex: 1; }

        /* Profile Info Card */
        .card { background: #F7F3FF; border-radius: 24px; padding: 24px; margin-bottom: 20px; border: 2px solid #F3E8FF; transition: box-shadow 200ms ease-in-out; }
        .card:hover { box-shadow: 0 20px 45px rgba(255, 138, 171, 0.20), 0 8px 24px rgba(255, 184, 107, 0.20); }

        .profile-info-card { padding: 0; overflow: hidden; }
        .profile-banner { display: flex; align-items: center; gap: 20px; padding: 32px; background: linear-gradient(135deg, rgba(249, 168, 212, 0.1), rgba(251, 191, 36, 0.1)); border-bottom: 2px solid #F3E8FF; }
        .avatar-large { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #FF8FAB, #C084FC); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; box-shadow: 0 8px 24px rgba(249,168,212,0.35); }
        .profile-name-section { display: flex; flex-direction: column; gap: 4px; }
        .profile-display-name { font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 700; color: #2D2A32; margin: 0; }
        .profile-username { font-size: 14px; color: #6B7280; margin: 0; }
        .profile-badge { display: inline-block; padding: 4px 12px; background: rgba(139, 92, 246, 0.1); color: #8B5CF6; font-size: 12px; font-weight: 600; border-radius: 12px; margin-top: 4px; }

        .btn-edit-profile { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 16px; border: none; background: linear-gradient(135deg, #FF8FAB, #FFB86B); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); transition: all 200ms ease-in-out; font-family: 'Inter', sans-serif; }
        .btn-edit-profile:hover { box-shadow: 0 8px 24px rgba(249,168,212,.45); transform: translateY(-2px); }
        .btn-edit-profile svg { width: 18px; height: 18px; }

        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 24px; }
        .info-item { display: flex; align-items: flex-start; gap: 16px; padding: 20px; background: #fff; border-radius: 16px; border: 2px solid #F3E8FF; transition: all 200ms ease-in-out; }
        .info-item:hover { border-color: #E9D5FF; box-shadow: 0 4px 12px rgba(192,132,252,0.15); }
        .info-icon { width: 40px; height: 40px; min-width: 40px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(255, 143, 171, 0.1), rgba(255, 184, 107, 0.1)); border-radius: 12px; }
        .info-icon svg { width: 20px; height: 20px; stroke: #FF8FAB; }
        .info-content { flex: 1; }
        .info-label { font-size: 12px; color: #6B7280; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-value { font-size: 15px; color: #374151; font-weight: 600; }

        /* Edit Card */
        .edit-card { background: #fff; }
        .edit-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #F3E8FF; }
        .edit-header h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 700; color: #2D2A32; margin: 0; }
        .btn-close { padding: 8px; border-radius: 12px; border: 2px solid #F3E8FF; background: #F7F3FF; color: #6B7280; cursor: pointer; transition: all 200ms ease-in-out; }
        .btn-close:hover { background: #F3E8FF; border-color: #E9D5FF; }
        .btn-close svg { width: 20px; height: 20px; }

        .edit-form { display: flex; flex-direction: column; gap: 20px; }
        .form-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .form-row:first-child { grid-template-columns: 1fr; }
        .form-field { display: flex; flex-direction: column; gap: 8px; }
        .form-field label { font-size: 13px; font-weight: 600; color: #6B7280; }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-icon { position: absolute; left: 14px; width: 18px; height: 18px; stroke: #C084FC; pointer-events: none; }
        .input-wrapper input { width: 100%; padding: 14px 14px 14px 44px; border: 2px solid #F3E8FF; border-radius: 16px; background: #FEFEFE; font-family: 'Inter', sans-serif; font-size: 14px; color: #374151; transition: all 200ms ease-in-out; }
        .input-wrapper input:focus { outline: none; border-color: #C084FC; box-shadow: 0 0 0 3px rgba(192,132,252,0.1); }
        .input-wrapper input::placeholder { color: #9CA3AF; }

        /* Select dropdown styles */
        .select-wrapper select { width: 100%; padding: 14px 14px 14px 44px; border: 2px solid #F3E8FF; border-radius: 16px; background: #FEFEFE; font-family: 'Inter', sans-serif; font-size: 14px; color: #374151; transition: all 200ms ease-in-out; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23C084FC'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; background-size: 20px; padding-right: 44px; }
        .select-wrapper select:focus { outline: none; border-color: #C084FC; box-shadow: 0 0 0 3px rgba(192,132,252,0.1); }

        /* Textarea styles */
        .textarea-wrapper { position: relative; display: block; }
        .textarea-wrapper textarea { width: 100%; padding: 14px 16px; border: 2px solid #F3E8FF; border-radius: 16px; background: #FEFEFE; font-family: 'Inter', sans-serif; font-size: 14px; color: #374151; transition: all 200ms ease-in-out; resize: vertical; min-height: 100px; }
        .textarea-wrapper textarea:focus { outline: none; border-color: #C084FC; box-shadow: 0 0 0 3px rgba(192,132,252,0.1); }
        .textarea-wrapper textarea::placeholder { color: #9CA3AF; }

        /* Full width field */
        .form-field.full-width { grid-column: 1 / -1; }
        .field-hint { font-size: 12px; color: #9CA3AF; margin-top: 4px; }

        /* Info link styles */
        .info-link { color: #8B5CF6; text-decoration: none; transition: all 200ms ease-in-out; }
        .info-link:hover { color: #7C3AED; text-decoration: underline; }

        .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px; }
        .btn-cancel { padding: 12px 24px; border-radius: 16px; border: 2px solid #F3E8FF; background: #fff; color: #6B7280; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 200ms ease-in-out; }
        .btn-cancel:hover { background: #F7F3FF; border-color: #E9D5FF; }
        .btn-save { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 16px; border: none; background: linear-gradient(135deg, #FF8FAB, #FFB86B); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); transition: all 200ms ease-in-out; font-family: 'Inter', sans-serif; }
        .btn-save:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(249,168,212,.45); transform: translateY(-2px); }
        .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-save svg { width: 18px; height: 18px; }
        .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Account Settings */
        .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .card-head h3 { font-size: 18px; font-weight: 700; color: #2D2A32; margin: 0 0 4px; }
        .card-subtitle { font-size: 13px; color: #6B7280; margin: 0; }
        .primary.outline.small { padding: 10px 16px; font-size: 13px; background: #fff; color: #8B5CF6; border: 2px solid #E9D5FF; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 200ms ease-in-out; }
        .primary.outline.small:hover { background: #F7F3FF; border-color: #C084FC; }
        .row-end { display: flex; justify-content: flex-end; margin: 0; }
        .danger.outline { padding: 12px 20px; border-radius: 16px; background: #fff; color: #EF4444; border: 2px solid #FEE2E2; font-weight: 700; cursor: pointer; transition: all 200ms ease-in-out; font-family: 'Inter', sans-serif; }
        .danger.outline:hover { background: #FEF2F2; border-color: #FCA5A5; }

        /* Drawer */
        .drawer { position: fixed; inset: 0; background: rgba(0,0,0,.15); display:flex; justify-content:flex-end; align-items:stretch; z-index: 50; }
        .drawer-inner { width: 420px; background:#fff; height: 100%; box-shadow: -12px 0 32px rgba(236,72,153,.15); padding: 24px; border-left: 4px solid #FF8FAB; }
        .drawer-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px; }
        .drawer-head h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 700; color: #2D2A32; margin: 0; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display:block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color:#6B7280; }
        .form-group input { width: 100%; padding: 14px 16px; border: 2px solid #F3E8FF; border-radius: 16px; background: #FEFEFE; transition: all 200ms ease-in-out; font-family:'Inter',sans-serif; font-size: 14px; }
        .form-group input:focus { outline: none; border-color: #C084FC; box-shadow: 0 0 0 3px rgba(192,132,252,0.1); }
        .drawer-actions { display:flex; justify-content:flex-end; gap: 12px; }
        .ghost { padding: 12px 20px; border-radius: 16px; border: 2px solid #F3E8FF; background: #fff; color: #6B7280; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 200ms ease-in-out; }
        .ghost:hover { background: #F7F3FF; border-color: #E9D5FF; }
        .primary { padding: 12px 20px; border-radius: 16px; border: none; background: linear-gradient(135deg, #FF8FAB, #FFB86B); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 6px 18px rgba(249,168,212,.35); transition: all 200ms ease-in-out; font-family: 'Inter', sans-serif; }
        .primary:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(249,168,212,.45); transform: translateY(-2px); }
        .primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .primary.loading { position: relative; }
        .primary.loading span { opacity: 0.7; }

        /* Password rules */
        .pw-rules { background: #FFF7ED; border: 2px solid #FDE68A; border-radius: 16px; padding: 16px; margin-bottom: 16px; }
        .pw-rules strong { display: block; margin-bottom: 8px; color: #92400E; font-size: 14px; }
        .pw-rules ul { padding-left: 20px; margin: 8px 0; color: #92400E; font-size: 13px; line-height: 1.6; }
        .pw-rules .muted { color: #6B7280; font-size: 12px; margin-top: 8px; }

        /* Toast */
        .toast { position: fixed; top: 24px; right: 24px; padding: 16px 20px; border-radius: 16px; font-weight: 600; z-index: 60; border: 2px solid transparent; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
        .toast.success { background: #D1FAE5; color: #065F46; border-color: #86EFAC; }
        .toast.error { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }

        /* Upgrade (pricing) */
        .grid-simple { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .pricing-grid { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 20px; margin-top: 20px; }
        @media (min-width: 1024px) { .pricing-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .plan-card { display: flex; flex-direction: column; }
        .plan-accent { box-shadow: 0 0 0 3px #E9D5FF inset; }
        .plan-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
        .plan-title { font-weight: 700; font-size: 20px; color: #2D2A32; }
        .plan-price { font-weight: 700; font-size: 24px; color: #374151; }
        .plan-price .mo { font-size: 14px; color: #6B7280; margin-left: 2px; }
        .plan-price.muted { color: #6B7280; font-weight: 600; }
        .plan-body { display: grid; gap: 12px; margin: 10px 0 16px; }
        .plan-sec { font-size: 14px; line-height: 1.6; }
        .plan-sec.muted { color: #6B7280; }
        .line { margin: 4px 0; }
        .plan-actions { margin-top: auto; display: flex; justify-content: flex-end; }

        .notes-title { font-weight: 700; margin-bottom: 8px; color: #2D2A32; }
        .notes-body { font-size: 14px; color: #6B7280; line-height: 1.6; }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .layout { grid-template-columns: 1fr; gap: 16px; }
          .sidebar { position: relative; height: auto; top: 0; }
          .info-grid { grid-template-columns: 1fr; }
          .form-row { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 768px) {
          .layout { padding: 16px; }
          .content { padding: 20px; }
          .profile-banner { flex-direction: column; align-items: flex-start; text-align: center; }
          .profile-banner .spacer { display: none; }
          .btn-edit-profile { width: 100%; justify-content: center; }
          .drawer-inner { width: 100%; }
          .grid-simple { grid-template-columns: 1fr; }
        }

        /* Loading State */
        .loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 16px; color: #6B7280; }
      `}</style>
    </div>
    // </>
  );
}
