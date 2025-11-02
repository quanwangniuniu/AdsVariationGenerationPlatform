// src/app/api/account/profile/update/route.ts
import type { NextRequest } from 'next/server';
import {
  BACKEND_API_BASE,
  trimBase,
  collectSetCookie,
  fetchCsrf,
  buildForwardHeaders,
  makePassthroughResponse,
} from '../../_utils';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  try {
    const base = trimBase(BACKEND_API_BASE);
    const { token: csrfToken, setCookies: csrfCookies } = await fetchCsrf(req, base);

    const bodyText = await req.text();
    const headers = buildForwardHeaders(req, {
      csrfToken,
      contentType: req.headers.get('content-type') || 'application/json',
      extraSetCookies: csrfCookies,
    });

    const upstream = await fetch(`${base}/api/account/profile/update/`, {
      method: 'PATCH',
      headers,
      body: bodyText,
    });

    const buf = await upstream.arrayBuffer();
    const upstreamCookies = collectSetCookie(upstream.headers);
    const finalCookies = [...csrfCookies, ...upstreamCookies];

    return makePassthroughResponse(upstream, buf, finalCookies);
  } catch (e: any) {
    console.error('[PROFILE_UPDATE] error:', e?.message || e);
    return new Response(JSON.stringify({ success: false, message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

// Optional: allow PUT as well (forwarded as PUT)
export async function PUT(req: NextRequest) {
  // Reuse PATCH logic but change method
  try {
    const base = trimBase(BACKEND_API_BASE);
    const { token: csrfToken, setCookies: csrfCookies } = await fetchCsrf(req, base);

    const bodyText = await req.text();
    const headers = buildForwardHeaders(req, {
      csrfToken,
      contentType: req.headers.get('content-type') || 'application/json',
      extraSetCookies: csrfCookies,
    });

    const upstream = await fetch(`${base}/api/account/profile/update/`, {
      method: 'PUT',
      headers,
      body: bodyText,
    });

    const buf = await upstream.arrayBuffer();
    const upstreamCookies = collectSetCookie(upstream.headers);
    const finalCookies = [...csrfCookies, ...upstreamCookies];

    return makePassthroughResponse(upstream, buf, finalCookies);
  } catch (e: any) {
    console.error('[PROFILE_UPDATE:PUT] error:', e?.message || e);
    return new Response(JSON.stringify({ success: false, message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
