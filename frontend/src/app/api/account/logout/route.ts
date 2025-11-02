// src/app/api/account/logout/route.ts
import type { NextRequest } from 'next/server';
import {
  BACKEND_API_BASE,
  trimBase,
  collectSetCookie,
  fetchCsrf,
  buildForwardHeaders,
  makePassthroughResponse,
} from '../_utils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const base = trimBase(BACKEND_API_BASE);

    // Some backends require CSRF for POST logout; do it to be safe.
    const { token: csrfToken, setCookies: csrfCookies } = await fetchCsrf(req, base);

    const headers = buildForwardHeaders(req, {
      csrfToken,
      contentType: 'application/json',
      extraSetCookies: csrfCookies,
    });

    const upstream = await fetch(`${base}/api/account/logout/`, {
      method: 'POST',
      headers,
    });

    const buf = await upstream.arrayBuffer();
    const upstreamCookies = collectSetCookie(upstream.headers);

    // NOTE: We intentionally do NOT clear auth_token cookie here in the proxy,
    // because backend may already be rotating/deleting tokens. If needed, you can
    // add a clearing cookie: "auth_token=; Path=/; Max-Age=0;".
    const finalCookies = [...csrfCookies, ...upstreamCookies];

    return makePassthroughResponse(upstream, buf, finalCookies);
  } catch (e: any) {
    console.error('[LOGOUT] error:', e?.message || e);
    return new Response(JSON.stringify({ success: false, message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
