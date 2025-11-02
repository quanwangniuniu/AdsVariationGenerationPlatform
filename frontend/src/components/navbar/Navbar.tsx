"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  appendAuthHeaders,
  getCsrfTokenFromCookie,
  headersInitToRecord,
  redirectToAuthWithNext,
} from "@/lib/authHelpers";

type NavbarProps = {
  workspaceId?: string;
  workspaceName?: string | null;
};

export default function Navbar({
  workspaceId,
  workspaceName,
}: NavbarProps = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const API_BASE_URL = '/api/account';

  function showMsg(text: string, type: 'success' | 'error') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  function headersJSON(extra?: HeadersInit, includeCsrf = false) {
    const base = {
      'Content-Type': 'application/json',
      ...headersInitToRecord(extra),
    };
    if (includeCsrf) {
      const hasCsrf = Object.keys(base).some((key) => key.toLowerCase() === 'x-csrftoken');
      if (!hasCsrf) {
        const token = getCsrfTokenFromCookie();
        if (token) base['X-CSRFToken'] = token;
      }
    }
    return appendAuthHeaders(base, { includeCsrf });
  }

  const buildWorkspacePath = (route: string) => {
    const normalized = route.startsWith("/") ? route : `/${route}`;
    if (workspaceId) {
      if (normalized === "/") {
        return `/workspaces/${workspaceId}`;
      }
      return `/workspaces/${workspaceId}${normalized}`;
    }
    return normalized;
  };

  const searchPath = buildWorkspacePath("/search");
  const aiChatPath = buildWorkspacePath("/ai_chat");
  const libraryPath = buildWorkspacePath("/library");
  const workspacePath = workspaceId ? buildWorkspacePath("/") : "/workspace";

  async function apiCall<T = any>(endpoint: string, init?: RequestInit): Promise<T> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const includeCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const url = `${API_BASE_URL}${endpoint}`;
    const { headers: _ignored, ...rest } = init ?? {};
    const res = await fetch(url, {
      method: 'GET',
      headers: headersJSON(undefined, includeCsrf),
      cache: 'no-store',
      redirect: 'follow',
      credentials: 'include',
      ...rest,
    });
    let payload: any = null;
    try {
      payload = res.status !== 204 ? await res.json() : {};
    } catch {
      // JSON parse error
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        redirectToAuthWithNext();
      }
      return (payload ?? { success: false, message: res.statusText }) as T;
    }
    return payload as T;
  }

  async function handleSignOut() {
    setLoading(true);
    try {
      await apiCall('/logout/', { method: 'POST' });
      showMsg('Signed out successfully!', 'success');
      // Redirect to auth page
      redirectToAuthWithNext();
    } catch (error) {
      showMsg('Sign out failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleRegister() {
    router.push('/auth?tab=register');
  }

  return (
    <nav className="w-full bg-yellow-500 text-black py-3 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4 left">
        <div className="brand-container">
          <span className="font-bold text-lg brand-logo">SparkAds</span>
          {workspaceId && (
            <div className="workspace-badge">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <span className="workspace-name">
                Workspace
              </span>
            </div>
          )}
        </div>
        {/* <input
          type="text"
          placeholder="Library"
          className="px-3 py-1 rounded"
        />
        <button className="bg-white px-3 py-1 rounded">Search</button> */}
      </div>
      <div className="flex gap-4 right">
     <a
          href={searchPath}
          onClick={(e) => {
            e.preventDefault();
            router.push(searchPath);
          }}
        >
          Search
        </a>
        <a
          href={aiChatPath}
          onClick={(e) => {
            e.preventDefault();
            router.push(aiChatPath);
          }}
       >
         Create Ads
       </a>
        <a
          href={libraryPath}
          onClick={(e) => {
            e.preventDefault();
            router.push(libraryPath);
          }}
        >
          Library
        </a>
        <a
          href="/history"
          onClick={(e) => { e.preventDefault(); router.push("/history"); }}
        >
          History
        </a>
        <a
          href={workspacePath}
          onClick={(e) => {
            e.preventDefault();
            router.push(workspacePath);
          }}
        >
          Workspace
        </a>
        <a
          href="/profile"
          onClick={(e) => { e.preventDefault(); router.push("/profile"); }}
        >
          Profile
        </a>
        <button
          className="bg-gray-200 px-3 py-1 rounded"
          onClick={handleSignOut}
          disabled={loading}
        >
          {loading ? 'Signing Out...' : 'Sign Out'}
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <style jsx>{`
        nav {
          width: 95%;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(20px);
          border-radius: 16px;
          padding: 16px 32px;
          box-shadow: 0 10px 30px rgba(236, 72, 153, 0.1),
            0 4px 10px rgba(139, 69, 19, 0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        nav .left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        nav .right {
          display: flex;
          align-items: center;
          gap: 18px;               
        }
        nav .brand { margin-right: 2px; }

        .brand-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: flex-start;
        }

        .brand-logo {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 600;
          background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .workspace-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(249, 168, 212, 0.12));
          color: #7c3aed;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 999px;
          border: 1px solid rgba(139, 92, 246, 0.2);
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);
          transition: all 0.2s ease;
        }

        .workspace-badge:hover {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(249, 168, 212, 0.18));
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
          transform: translateY(-1px);
        }

        .workspace-badge svg {
          flex-shrink: 0;
        }

        .workspace-name {
          max-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        nav input {
          width: 260px;
          min-width: 200px;
        }
        nav .search-btn { padding-inline: 14px; } 

        
        nav .right a {
          padding: 6px 4px;        
        }
        @media (max-width: 1024px) {
          nav .right { flex-wrap: wrap; row-gap: 8px; }
          nav .left  { flex-wrap: wrap; row-gap: 8px; }
          nav input  { width: 220px; }
        }
        @media (max-width: 768px) {
          nav .right, nav .left { justify-content: center; }
          nav input { width: 100%; max-width: 320px; }
        }

        nav input {
          border: 2px solid #fce7f3;
          border-radius: 12px;
          padding: 8px 14px;
          font-family: 'Inter', sans-serif;
          background: #fefefe;
          transition: all 0.3s ease;
        }
        nav input:focus {
          outline: none;
          border-color: #f9a8d4;
          background: #fdf2f8;
          box-shadow: 0 0 0 3px rgba(249, 168, 212, 0.15);
        }

        nav button {
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: 'Inter', sans-serif;
        }

        nav button.bg-white {
          background: linear-gradient(135deg, #f9a8d4, #fbbf24);
          color: #fff;
          box-shadow: 0 4px 10px rgba(249, 168, 212, 0.3);
        }
        nav button.bg-white:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(249, 168, 212, 0.4);
        }

        nav button.bg-gray-200 {
          background: transparent;
          border: 2px solid #f9a8d4;
          color: #ec4899;
        }
        nav button.bg-gray-200:hover {
          background: #f9a8d4;
          color: #fff;
        }

        nav button.bg-black {
          background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
          color: #fff;
          font-weight: 600;
        }
        nav button.bg-black:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(249, 168, 212, 0.4);
        }

        nav a {
          color: #6b7280;
          text-decoration: none;
          font-weight: 500;
          font-family: 'Inter', sans-serif;
          transition: color 0.3s ease;
        }
        nav a:hover {
          color: #ec4899;
        }

        .message {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          z-index: 1000;
          max-width: 300px;
        }
        .message.success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #86efac;
        }
        .message.error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }

        @media (max-width: 768px) {
          nav {
            flex-direction: column;
            gap: 12px;
            padding: 12px 20px;
          }
          nav .flex.items-center.gap-4,
          nav .flex.gap-4 {
            flex-wrap: wrap;
            justify-content: center;
          }
        }
      `}</style>
    </nav>
  );





}
