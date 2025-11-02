import type { NextRequest } from 'next/server';
import {
  BACKEND_API_BASE,
  trimBase,
  fetchCsrf,
  buildForwardHeaders,
  collectSetCookie,
  makePassthroughResponse,
  getCookieFromHeader,
} from '@/app/api/account/_utils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const base = trimBase(BACKEND_API_BASE);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[INVITE_ACCEPT] incoming cookie', req.headers.get('cookie'));
  }

  const incomingCookie = req.headers.get('cookie');
  let csrfCookies: string[] = [];
  let csrfToken = getCookieFromHeader(incomingCookie, 'csrftoken') ?? undefined;

  if (!csrfToken) {
    const fetched = await fetchCsrf(req, base);
    csrfToken = fetched.token;
    csrfCookies = fetched.setCookies;
  }

  const bodyText = await req.text();
  const headers = buildForwardHeaders(req, {
    csrfToken,
    contentType: req.headers.get('content-type') || 'application/json',
    extraSetCookies: csrfCookies,
  });

  const upstream = await fetch(`${base}/api/invite/accept_invitation/`, {
    method: 'POST',
    headers,
    body: bodyText,
  });

  const buf = await upstream.arrayBuffer();
  const upstreamCookies = collectSetCookie(upstream.headers);
  const finalCookies = [...csrfCookies, ...upstreamCookies];

  return makePassthroughResponse(upstream, buf, finalCookies);
}
