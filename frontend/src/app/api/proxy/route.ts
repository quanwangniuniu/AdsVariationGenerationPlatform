// src/app/api/proxy/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Backend base URL: must be provided via environment variables.
const resolvedBackendBase =
  process.env.BACKEND_API_BASE || process.env.NEXT_PUBLIC_API_BASE;

if (!resolvedBackendBase) {
  throw new Error(
    "[api/proxy] BACKEND_API_BASE (or NEXT_PUBLIC_API_BASE) must be configured."
  );
}

const BACKEND_API_BASE = resolvedBackendBase;

// Whitelist of allowed request headers (to be forwarded)
const forwardHeaders = (req: NextRequest) => {
  const h: Record<string, string> = {};
  const keep = [
    'content-type',
    'authorization',
    'cookie',
    'x-csrftoken',
  ];
  keep.forEach((k) => {
    const v = req.headers.get(k);
    if (v) h[k] = v;
  });
  return h;
};

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  const url = new URL(req.url);
  const qs = url.search ? url.search : '';

  // Uniformly forward to backend /api/*
  const target = `${BACKEND_API_BASE.replace(/\/+$/, '')}/api/${path}${qs}`;

  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders(req),
    redirect: 'manual',
  };

  // Only read body for methods that can have body
  if (!['GET', 'HEAD'].includes(req.method)) {
    const body = await req.text();
    init.body = body;
  }

  try {
    const resp = await fetch(target, init);
    const buf = await resp.arrayBuffer();
    return new Response(buf, {
      status: resp.status,
      headers: {
        'content-type': resp.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    console.error('[API proxy] fetch failed:', e);
    return Response.json(
      { error: 'Failed to reach backend' },
      { status: 502 },
    );
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
