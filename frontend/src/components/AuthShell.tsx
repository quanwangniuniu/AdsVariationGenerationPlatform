// components/AuthShell.tsx
'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveUser, clearUser } from '@/lib/userStorage';

import {
  appendAuthHeaders,
  ensureValidCsrfToken,
  headersInitToRecord,
  redirectToAuthWithNext,
  persistAuthToken,
  clearAuthTokenStorage,
} from '@/lib/authHelpers';


type Tab = 'login' | 'register';
type Message = { text: string; type: 'success' | 'error' } | null;

type User = {
  id: string | number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at?: string;
};

const API_BASE_URL = '/api/account';

function joinPath(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function headersJSON(extra?: Record<string, string>) {
  return { 'Content-Type': 'application/json', ...(extra || {}) };
}


export default function AuthShell() {
  const [tab, setTab] = useState<Tab>('login');
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [registeredCredentials, setRegisteredCredentials] = useState<{ username: string; password: string } | null>(null);

  const didHydrateRef = useRef(false);
  const isAuthed = useMemo(() => Boolean(currentUser), [currentUser]);
  const loginUsernameRef = useRef<HTMLInputElement>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);

  // Set initial tab based on URL parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'register') {
      setTab('register');
    } else {
      setTab('login');
    }
  }, [searchParams]);

  // Simplify tab logic, only handle login and register
  useEffect(() => {
    if (!isAuthed && tab !== 'login' && tab !== 'register') {
      setTab('login');
    }
  }, [isAuthed, tab]);

  // Auto-fill login form when switching to login tab after registration
  useEffect(() => {
    if (tab === 'login' && registeredCredentials) {
      // Use setTimeout to ensure form is rendered
      setTimeout(() => {
        if (loginUsernameRef.current && loginPasswordRef.current) {
          loginUsernameRef.current.value = registeredCredentials.username;
          loginPasswordRef.current.value = registeredCredentials.password;
          // Clear the credentials after filling to prevent refilling on next switch
          setRegisteredCredentials(null);
        }
      }, 0);
    }
  }, [tab, registeredCredentials]);

  function showMsg(text: string, type: 'success' | 'error') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  async function apiCall<T = any>(endpoint: string, init?: RequestInit): Promise<T> {
    const url = joinPath(API_BASE_URL, endpoint);
    const method = (init?.method ?? 'GET').toUpperCase();
    const includeCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const baseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headersInitToRecord(init?.headers),
    };
    const { headers: _ignored, ...restInit } = init ?? {};
    let headers = appendAuthHeaders(baseHeaders, { includeCsrf });

    if (includeCsrf && !Object.keys(headers).some((key) => key.toLowerCase() === 'x-csrftoken')) {
      const csrf = await ensureValidCsrfToken();
      if (csrf) {
        headers['X-CSRFToken'] = csrf;
        headers['x-csrftoken'] = csrf;
      }
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      credentials: 'include',
      redirect: 'follow',
      ...restInit,
    });
    let payload: any = null;
    try {
      payload = res.status !== 204 ? await res.json() : {};
    } catch {
      // JSON parse error
    }
    if (!res.ok) {
      return (payload ?? { success: false, message: res.statusText }) as T;
    }
    return payload as T;
  }

  /**
   * Improved error message handler
   * Distinguishes different error types and returns more user-friendly messages
   */
  function parseErrorMessage(response: any, defaultMsg: string): string {
    // 1. Check if there is an explicit error message
    if (response?.message && typeof response.message === 'string') {
      return response.message;
    }

    // 2. Check if there is detailed error information (details)
    if (response?.details) {
      if (typeof response.details === 'string') {
        return response.details;
      }
      if (typeof response.details === 'object') {
        return joinErrors(response.details);
      }
    }

    // 3. Check for field-level errors (errors)
    if (response?.errors) {
      return joinErrors(response.errors);
    }

    // 4. Check non-field errors (non_field_errors)
    if (response?.non_field_errors) {
      if (Array.isArray(response.non_field_errors)) {
        return response.non_field_errors.join('; ');
      }
      if (typeof response.non_field_errors === 'string') {
        return response.non_field_errors;
      }
    }

    // 5. Return a friendly message based on the status code
    if (response?.status === 400) {
      return 'Invalid credentials. Please check your username/email and password.';
    }
    if (response?.status === 401) {
      return 'Authentication failed. Please check your credentials.';
    }
    if (response?.status === 404) {
      return 'User not found. Please check your username/email.';
    }
    if (response?.status === 429) {
      return 'Too many attempts. Please try again later.';
    }
    if (response?.status >= 500) {
      return 'Server error. Please try again later.';
    }

    return defaultMsg;
  }

  function joinErrors(errs?: Record<string, string[] | string> | string) {
    if (!errs) return '';
    if (typeof errs === 'string') return errs;
    const lines: string[] = [];
    for (const [f, arr] of Object.entries(errs)) {
      const fieldName = f === 'non_field_errors' ? '' : `${f}: `;
      if (Array.isArray(arr)) {
        lines.push(`${fieldName}${arr.join(', ')}`);
      } else {
        lines.push(`${fieldName}${arr}`);
      }
    }
    return lines.join('; ');
  }

  async function hydrateUserFromServer(): Promise<User | null> {
    // Get user information directly from server, no localStorage caching
    const v: any = await apiCall('/verify', { method: 'GET' }).catch(() => null);
    const verifyOk = v?.success === true;

    if (!verifyOk) {
      return null;
    }

    const p: any = await apiCall('/profile/', { method: 'GET' }).catch(() => null);
    const userPayload = (p?.success && p?.user) ? p.user : (v?.user || null);

    return userPayload ?? null;
  }

  // Remove auto-login logic, require re-login every time the page is opened
  // useEffect(() => {
  //   if (didHydrateRef.current) return;
  //   didHydrateRef.current = true;

  //   (async () => {
  //     const u = await hydrateUserFromServer();
  //     if (u) {
  //       setCurrentUser(u);
  //       // User is logged in, redirect to workspace
  //       router.replace('/workspace');
  //     } else {
  //       setCurrentUser(null);
  //       setTab('login');
  //     }
  //   })();
  // }, []);


  /**
   * LOGIN - Improved error handling
   */
  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');

    if (!username) return showMsg('Please enter username or email.', 'error');
    if (!password) return showMsg('Please enter password.', 'error');

    setLoading(true);
    const r: any = await apiCall('/login', {
      method: 'POST',
      headers: headersJSON(),
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);

    if (r?.success) {
      const u = (await hydrateUserFromServer()) ?? r.user ?? null;
      if (u) {
        setCurrentUser(u);
        saveUser(u);
        if (r.token) {
          try {
            persistAuthToken(String(r.token));
          } catch (err) {
            console.warn('Failed to persist auth token', err);
          }
        }
        showMsg(r?.message || 'Welcome back!', 'success');
        formEl.reset();

        const params = new URLSearchParams(window.location.search);
        const redirectTarget = params.get('next') || '/search';
        router.replace(redirectTarget);
      } else {
        showMsg('Login succeeded but failed to load profile.', 'error');
      }
    } else {
      // Use the improved error parser
      const errorMsg = parseErrorMessage(r, 'Login failed. Please try again.');
      showMsg(errorMsg, 'error');
    }
  }

  /**
   * REGISTER - Improved error handling
   */
  async function onRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const data = {
      username: String(form.get('username') || '').trim(),
      email: String(form.get('email') || '').trim(),
      first_name: String(form.get('first_name') || '').trim(),
      last_name: String(form.get('last_name') || '').trim(),
      password: String(form.get('password') || ''),
      password_confirm: String(form.get('password_confirm') || ''),
    };

    setLoading(true);
    const r: any = await apiCall('/register', {
      method: 'POST',
      headers: headersJSON(),
      body: JSON.stringify(data),
    });
    setLoading(false);

    if (r?.success) {
      // Save username and password for auto-fill in login form
      setRegisteredCredentials({
        username: data.username,
        password: data.password,
      });
      // Show success message
      showMsg(r?.message || 'Account created successfully! Please sign in.', 'success');
      // Switch to login tab
      setTab('login');
      // Reset registration form
      formEl.reset();
    } else {
      const errorMsg = parseErrorMessage(r, 'Registration failed. Please try again.');
      showMsg(errorMsg, 'error');
    }
  }


  async function onLogout() {
    try {
      await apiCall('/logout/', { method: 'POST' });
    } catch {}
    setCurrentUser(null);
    clearUser();
    try {
      clearAuthTokenStorage();
      sessionStorage.removeItem('csrfToken');
    } catch (err) {
      console.warn('Failed to clear auth token', err);
    }
    setTab('login');
    showMsg('Signed out successfully!', 'success');
  }

  return (
    <div className="page">
      <div className="floating-elements">
        <div className="floating-circle" />
        <div className="floating-circle" />
        <div className="floating-circle" />
      </div>

      <div className="container">
        <div className="logo">
          <h1>Elegance</h1>
        </div>

        <div className="tab-buttons" id="tab-buttons">
          <button className={`tab-button ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>
            Sign In
          </button>
          <button className={`tab-button ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>
            Sign Up
          </button>
        </div>

        {message && <div className={`message ${message.type}`}>{message.text}</div>}

        {tab === 'login' && (
          <section className="form-section active" id="login-section">
            <form id="login-form" onSubmit={onLogin}>
              <div className="form-group">
                <label htmlFor="login-username">Username or Email</label>
                <input type="text" id="login-username" name="username" ref={loginUsernameRef} required />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <input type="password" id="login-password" name="password" ref={loginPasswordRef} required />
              </div>
              <button type="submit" className={`submit-btn ${loading ? 'loading' : ''}`} disabled={loading} data-testid="auth-login-button">
                <div className="loading-spinner" style={{ display: loading ? 'inline-block' : 'none' }} />
                <span>Sign In</span>
              </button>
            </form>
          </section>
        )}

        {tab === 'register' && (
          <section className="form-section active" id="register-section">
            <form id="register-form" onSubmit={onRegister}>
              <div className="form-group">
                <label htmlFor="register-username">Username</label>
                <input type="text" id="register-username" name="username" required data-testid="auth-username-input" />
              </div>
              <div className="form-group">
                <label htmlFor="register-email">Email</label>
                <input type="email" id="register-email" name="email" required data-testid="auth-email-input" />
              </div>
              <div className="form-group">
                <label htmlFor="register-first-name">First Name</label>
                <input type="text" id="register-first-name" name="first_name" data-testid="auth-firstname-input" />
              </div>
              <div className="form-group">
                <label htmlFor="register-last-name">Last Name</label>
                <input type="text" id="register-last-name" name="last_name" data-testid="auth-lastname-input" />
              </div>
              <div className="form-group">
                <label htmlFor="register-password">Password</label>
                <input type="password" id="register-password" name="password" required data-testid="auth-password-input" />
              </div>
              <div className="form-group">
                <label htmlFor="register-password-confirm">Confirm Password</label>
                <input type="password" id="register-password-confirm" name="password_confirm" required data-testid="auth-password-confirm-input" />
              </div>
              <button type="submit" className={`submit-btn ${loading ? 'loading' : ''}`} disabled={loading} data-testid="auth-register-button">
                <div className="loading-spinner" style={{ display: loading ? 'inline-block' : 'none' }} />
                <span>Create Account</span>
              </button>
            </form>
          </section>
        )}

      </div>

      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; }
      `}</style>
      <style jsx>{`
        .page {
          min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;
          background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
          position:relative;
        }
        .container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 48px 40px;
          box-shadow: 0 20px 40px rgba(236, 72, 153, 0.1), 0 8px 16px rgba(139, 69, 19, 0.05);
          width: 100%; max-width: 420px; position: relative; overflow: hidden;
        }
        .container::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 4px;
          background: linear-gradient(90deg, #f9a8d4, #fbbf24, #c084fc);
          border-radius: 24px 24px 0 0;
        }
        .logo { text-align:center; margin-bottom:32px; }
        .logo h1 {
          font-family:'Playfair Display',serif; font-size:32px; font-weight:600;
          background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          margin-bottom: 8px;
        }
        .tab-buttons { display:flex; background:#fef3f2; border-radius:16px; padding:4px; margin-bottom:32px; }
        .tab-button { flex:1; background:none; border:none; padding:12px 24px; border-radius:12px; font-size:14px; font-weight:500; color:#9ca3af; cursor:pointer; transition:all .3s ease; }
        .tab-button.active { background: linear-gradient(135deg, #f9a8d4, #fbbf24); color:#fff; box-shadow: 0 4px 12px rgba(249,168,212,.3); }
        .form-section { display:block; animation: fadeInUp .5s ease; }
        @keyframes fadeInUp { from{ opacity:0; transform: translateY(20px);} to{ opacity:1; transform: translateY(0);} }
        .form-group { margin-bottom:24px; }
        .form-group label { display:block; margin-bottom:8px; font-size:14px; font-weight:500; color:#6b7280; }
        .form-group input { width:100%; padding:16px 20px; border:2px solid #fce7f3; border-radius:16px; font-size:16px; background:#fefefe; transition:all .3s ease; font-family:'Inter',sans-serif; }
        .form-group input:focus { outline:none; border-color:#f9a8d4; background:#fdf2f8; box-shadow:0 0 0 4px rgba(249,168,212,.1); }
        .submit-btn { width:100%; padding:16px; background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc); border:none; border-radius:16px; color:#fff; font-size:16px; font-weight:600; cursor:pointer; transition:all .3s ease; margin-bottom:16px; position:relative; overflow:hidden; }
        .submit-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(249,168,212,.4); }
        .submit-btn:active { transform: translateY(0); }
        .submit-btn.loading { pointer-events:none; opacity:.9; }
        .loading-spinner { display:none; width:20px; height:20px; border:2px solid rgba(255,255,255,.3); border-radius:50%; border-top-color:#fff; animation: spin 1s ease-in-out infinite; margin-right:8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .message { padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; font-size: 14px; font-weight: 500; }
        .message.success { background:#d1fae5; color:#065f46; border:1px solid #86efac; }
        .message.error { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
        @media (max-width: 480px) {
          .container { padding: 32px 24px; margin: 20px; }
        }
        .floating-elements { position: fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:-1; }
        .floating-circle { position:absolute; border-radius:50%; animation: float 6s ease-in-out infinite; }
        .floating-circle:nth-child(1) { width:80px; height:80px; background: rgba(249,168,212,.1); top:20%; left:10%; animation-delay:0s; }
        .floating-circle:nth-child(2) { width:60px; height:60px; background: rgba(192,132,252,.1); top:60%; right:15%; animation-delay:2s; }
        .floating-circle:nth-child(3) { width:100px; height:100px; background: rgba(251,191,36,.1); bottom:20%; left:20%; animation-delay:4s; }
        @keyframes float { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-20px); } }
      `}</style>
    </div>
  );
}
