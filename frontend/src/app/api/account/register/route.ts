// src/app/api/account/register/route.ts
import type { NextRequest } from 'next/server';
import {
  BACKEND_API_BASE,
  trimBase,
  collectSetCookie,
  fetchCsrf,
  buildForwardHeaders,
  maybeSetAuthCookieFromBody,
  makePassthroughResponse,
} from '../_utils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const base = trimBase(BACKEND_API_BASE);

    const { token: csrfToken, setCookies: csrfCookies } = await fetchCsrf(req, base);

    const bodyText = await req.text();
    const headers = buildForwardHeaders(req, {
      csrfToken,
      contentType: req.headers.get('content-type') || 'application/json',
      extraSetCookies: csrfCookies,
    });

    const upstream = await fetch(`${base}/api/account/register/`, {
      method: 'POST',
      headers,
      body: bodyText,
    });

    const buf = await upstream.arrayBuffer();
    const upstreamCookies = collectSetCookie(upstream.headers);
    const authCookies = maybeSetAuthCookieFromBody(buf, upstream.ok);
    const finalCookies = [...csrfCookies, ...upstreamCookies, ...authCookies];

    return makePassthroughResponse(upstream, buf, finalCookies);
  } catch (err: any) {
    console.error('[REGISTER] proxy error:', err?.message || err);
    return new Response(JSON.stringify({ success: false, message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
