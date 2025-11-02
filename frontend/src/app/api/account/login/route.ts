// src/app/api/account/login/route.ts
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

/**
 * Improved login route handler
 * Able to correctly distinguish and propagate different types of errors
 */
export async function POST(req: NextRequest) {
  try {
    const base = trimBase(BACKEND_API_BASE);

    // 1) CSRF handshake
    const { token: csrfToken, setCookies: csrfCookies } = await fetchCsrf(req, base);

    // 2) Forward login with CSRF + cookies
    const bodyText = await req.text();
    const headers = buildForwardHeaders(req, {
      csrfToken,
      contentType: req.headers.get('content-type') || 'application/json',
      extraSetCookies: csrfCookies,
    });

    const upstream = await fetch(`${base}/api/account/login/`, {
      method: 'POST',
      headers,
      body: bodyText,
    });

    const buf = await upstream.arrayBuffer();

    // 3) Parse response to add status code for better error handling
    let responseBody: any = null;
    try {
      const text = new TextDecoder().decode(buf);
      responseBody = JSON.parse(text);

      // If the backend returns a failure, add the HTTP status code to the response
      if (!upstream.ok && responseBody && typeof responseBody === 'object') {
        responseBody.status = upstream.status;

        // Add more user-friendly error messages based on the status code
        if (upstream.status === 400) {
          if (!responseBody.message) {
            responseBody.message = 'Invalid credentials. Please check your username/email and password.';
          }
        } else if (upstream.status === 401) {
          if (!responseBody.message) {
            responseBody.message = 'Authentication failed. Please check your credentials.';
          }
        } else if (upstream.status === 404) {
          if (!responseBody.message) {
            responseBody.message = 'User not found. Please check your username/email.';
          }
        } else if (upstream.status === 429) {
          if (!responseBody.message) {
            responseBody.message = 'Too many login attempts. Please try again later.';
          }
        } else if (upstream.status >= 500) {
          if (!responseBody.message) {
            responseBody.message = 'Server error. Please try again later.';
          }
        }
      }
    } catch (parseError) {
      // JSON parse error - likely not JSON response
      console.error('[LOGIN] Failed to parse response:', parseError);
    }

    // 4) Merge Set-Cookie (CSRF + upstream + new auth_token if present)
    const upstreamCookies = collectSetCookie(upstream.headers);
    const authCookies = maybeSetAuthCookieFromBody(buf, upstream.ok);
    const finalCookies = [...csrfCookies, ...upstreamCookies, ...authCookies];

    // 5) Return response with enhanced error information
    if (responseBody && !upstream.ok) {
      // Return JSON response with status code preserved
      const modifiedBuffer = new TextEncoder().encode(JSON.stringify(responseBody)).buffer;
      return makePassthroughResponse(upstream, modifiedBuffer, finalCookies);
    }

    // Success case - return original response
    return makePassthroughResponse(upstream, buf, finalCookies);
  } catch (err: any) {
    console.error('[LOGIN] proxy error:', err?.message || err);

    // Return detailed error for network/proxy failures
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Unable to connect to authentication server. Please try again.',
        details: err?.message || 'Internal Server Error',
        status: 500,
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
}
