// src/app/api/assets/_proxy.ts
import type { NextRequest } from 'next/server';
import {
  BACKEND_API_BASE,
  trimBase,
  fetchCsrf,
  buildForwardHeaders,
  makePassthroughResponse,
  maybeSetAuthCookieFromBody,
} from '@/app/api/account/_utils';

export const runtime = 'nodejs';

/**
 * Generic proxy function for asset endpoints.
 * Forwards requests to backend with proper CSRF token handling.
 */
export async function forward(req: NextRequest, path: string) {
  const base = trimBase(BACKEND_API_BASE);
  const method = req.method;

  // For methods that modify data, fetch CSRF token
  let csrfToken: string | undefined;
  const setCookies: string[] = [];

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfData = await fetchCsrf(req, base);
    csrfToken = csrfData.token;
    setCookies.push(...csrfData.setCookies);
  }

  // Build headers
  const headers = buildForwardHeaders(req, { csrfToken, extraSetCookies: setCookies });

  // Prepare body for non-GET/DELETE requests
  let body: any = undefined;
  if (method !== 'GET' && method !== 'DELETE' && method !== 'HEAD') {
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await req.json();
      } else if (contentType.includes('multipart/form-data')) {
        // For file uploads, pass the body as-is
        body = await req.arrayBuffer();
      } else {
        body = await req.text();
      }
    } catch {
      // If body parsing fails, leave it undefined
    }
  }

  // Make the request to backend
  const upstream = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { 
      body: body instanceof ArrayBuffer ? body : JSON.stringify(body) 
    } : {}),
  });

  // Handle 204 No Content response specially
  if (upstream.status === 204) {
    // For 204 responses, there's no body to read
    const responseHeaders = new Headers();
    responseHeaders.set('content-type', 'application/json');
    setCookies.forEach((ck) => responseHeaders.append('set-cookie', ck));

    // Return an empty JSON response with 200 OK status for frontend compatibility
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: responseHeaders,
    });
  }

  // Read response body
  const responseData = await upstream.arrayBuffer();

  // Check for auth token in response (for login/register)
  if (method === 'POST' && path.includes('/account/')) {
    const authCookies = maybeSetAuthCookieFromBody(responseData, upstream.ok);
    setCookies.push(...authCookies);
  }

  // Return the response
  return makePassthroughResponse(upstream, responseData, setCookies);
}
