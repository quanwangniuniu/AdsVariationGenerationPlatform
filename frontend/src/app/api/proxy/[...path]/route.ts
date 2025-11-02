// src/app/api/proxy/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Unified backend base URL must be provided via environment configuration.
const resolvedBackendBase =
  process.env.BACKEND_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.INTERNAL_API_BASE;

if (!resolvedBackendBase) {
  throw new Error(
    "[api/proxy/[...path]] BACKEND_API_BASE (or NEXT_PUBLIC_API_BASE) must be configured."
  );
}

const BACKEND_API_BASE = resolvedBackendBase;

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const joined = params.path.join('/');
  const pathWithSlash = joined.endsWith('/') ? joined : `${joined}/`;
  const upstreamUrl = new URL(
    `/api/${pathWithSlash}`,
    BACKEND_API_BASE.replace(/\/+$/, '')
  );

  // Copy headers, but allow Authorization header from frontend to be passed through to backend
  const headers = new Headers(req.headers);
  // Optional: restrict or sanitize certain headers
  headers.set('host', upstreamUrl.host);

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    cache: 'no-store',
    redirect: 'manual',
  };

  try {
    const res = await fetch(upstreamUrl, init);
    const raw = await res.arrayBuffer();
    const outHeaders = new Headers(res.headers);
    outHeaders.delete('transfer-encoding');
    outHeaders.delete('content-encoding');

    return new NextResponse(raw, { status: res.status, headers: outHeaders });
  } catch (e: any) {
    console.error('[API proxy] fetch failed:', e?.message || e);
    return NextResponse.json(
      { error: 'Failed to reach backend', detail: e?.message || 'ECONNREFUSED' },
      { status: 502 }
    );
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
