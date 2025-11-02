// src/app/api/account/password/change/route.ts
import type { NextRequest } from 'next/server';
import {
  BACKEND_API_BASE,
  trimBase,
  collectSetCookie,
  fetchCsrf,
  buildForwardHeaders,
  maybeSetAuthCookieFromBody,
  makePassthroughResponse,
} from '../../_utils';

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

    const upstream = await fetch(`${base}/api/account/password/change/`, {
      method: 'POST',
      headers,
      body: bodyText,
    });

    const buf = await upstream.arrayBuffer();
    const upstreamCookies = collectSetCookie(upstream.headers);
    const authCookies = maybeSetAuthCookieFromBody(buf, upstream.ok); // rotate auth_token
    const finalCookies = [...csrfCookies, ...upstreamCookies, ...authCookies];

    return makePassthroughResponse(upstream, buf, finalCookies);
  } catch (e: any) {
    console.error('[PASSWORD_CHANGE] error:', e?.message || e);
    return new Response(JSON.stringify({ success: false, message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
