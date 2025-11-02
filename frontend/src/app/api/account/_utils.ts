// src/app/api/account/_utils.ts
export const runtime = 'nodejs';

/**
 * Backend base URL priority:
 * - BACKEND_API_BASE (e.g. http://backend:8000 in Docker)
 * - NEXT_PUBLIC_API_BASE
 * The value must be explicitly configured.
 */
const resolvedBackendBase =
  process.env.BACKEND_API_BASE || process.env.NEXT_PUBLIC_API_BASE;

if (!resolvedBackendBase) {
  throw new Error(
    "[api/account/_utils] BACKEND_API_BASE (or NEXT_PUBLIC_API_BASE) must be configured."
  );
}

export const BACKEND_API_BASE = resolvedBackendBase as string;

/** Trim trailing slashes */
export function trimBase(u: string) {
  return u.replace(/\/+$/, '');
}

/** Collect all Set-Cookie headers from a fetch response (Node environment). */
export function collectSetCookie(headers: Headers): string[] {
  const raw = (headers as any).raw?.();
  if (raw?.['set-cookie']) return raw['set-cookie'];
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

/** Tiny cookie parser */
export function getCookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const found = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.split('=').slice(1).join('=')) : null;
}

/**
 * Try multiple CSRF endpoints so we work with different urlconfs:
 * - /api/account/csrf/          (recommended)
 * - /api/account/csrf-token/    (alternate)
 * - /csrf/ and /csrf-token/     (fallbacks)
 */
const CSRF_PATHS = ['/api/account/csrf/', '/api/account/csrf-token/', '/csrf/', '/csrf-token/'];
const CSRF_TOKEN_PATTERN = /^(?:[A-Za-z0-9]{32}|[A-Za-z0-9]{64})$/;

function normalizeCsrfToken(token?: unknown): string | undefined {
  if (typeof token !== 'string') return undefined;
  const trimmed = token.trim();
  return CSRF_TOKEN_PATTERN.test(trimmed) ? trimmed : undefined;
}

/**
 * Fetch CSRF token from backend. Returns { token, setCookies[] } when possible.
 * It also forwards the incoming request cookies to preserve session affinity.
 */
export async function fetchCsrf(req: Request, base: string) {
  let token: string | undefined;
  const setCookies: string[] = [];
  const incomingCookie = req.headers.get('cookie');

  for (const path of CSRF_PATHS) {
    try {
      const resp = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: {
          ...(incomingCookie ? { cookie: incomingCookie } : {}),
        },
      });
      if (!resp.ok) continue;

      setCookies.push(...collectSetCookie(resp.headers));

      // Try JSON field
      try {
        const js = await resp.json();
        const candidate = normalizeCsrfToken(js?.csrfToken);
        if (candidate) {
          token = candidate;
          break;
        }
      } catch {
        // ignore non-JSON
      }
      // Try header
      const hdr = normalizeCsrfToken(resp.headers.get('x-csrftoken'));
      if (hdr) {
        token = hdr;
        break;
      }
      // Try cookie
      const cookieToken = normalizeCsrfToken(getCookieFromHeader(resp.headers.get('set-cookie'), 'csrftoken'));
      if (cookieToken) {
        token = cookieToken;
        break;
      }
    } catch {
      // ignore and try next
    }
  }

  // Fallback: try read csrftoken from incoming cookies (maybe already present)
  if (!token) {
    token = normalizeCsrfToken(getCookieFromHeader(incomingCookie, 'csrftoken')) ?? undefined;
  }
  return { token, setCookies };
}

/** Add pass-through headers for backend requests (cookie + x-csrftoken + content-type) */
function parseCookieHeader(cookieHeader: string | null) {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;

  cookieHeader.split(';').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) {
      map.set(key, value);
    }
  });
  return map;
}

function parseSetCookieString(setCookie: string) {
  const firstSegment = setCookie.split(';', 1)[0] ?? '';
  const eqIdx = firstSegment.indexOf('=');
  if (eqIdx === -1) {
    return null;
  }
  const key = firstSegment.slice(0, eqIdx).trim();
  const value = firstSegment.slice(eqIdx + 1).trim();
  if (!key) return null;
  return [key, value] as const;
}

function buildCookieHeader(originalCookie: string | null, extraSetCookies?: string[]) {
  const cookies = parseCookieHeader(originalCookie);
  extraSetCookies?.forEach((ck) => {
    const parsed = parseSetCookieString(ck);
    if (parsed) {
      cookies.set(parsed[0], parsed[1]);
    }
  });
  if (!cookies.size) {
    return { header: null, cookies } as const;
  }
  const header = Array.from(cookies.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  return { header, cookies } as const;
}

export function buildForwardHeaders(
  req: Request,
  opts?: { csrfToken?: string; contentType?: string; extraSetCookies?: string[] }
) {
  const contentType = opts?.contentType || req.headers.get('content-type') || 'application/json';
  const cookieResult = buildCookieHeader(req.headers.get('cookie'), opts?.extraSetCookies);
  const cookieHeader = cookieResult.header;
  const cookieJar = cookieResult.cookies;

  const headers: Record<string, string> = {
    'content-type': contentType,
  };

  const csrfToken = normalizeCsrfToken(opts?.csrfToken ?? cookieJar.get('csrftoken'));
  if (csrfToken) {
    headers['x-csrftoken'] = csrfToken;
    headers['X-CSRFToken'] = csrfToken;
  }

  if (cookieHeader) headers.cookie = cookieHeader;

  // Preserve origin / referer for Django's secure CSRF checks (requires https referer)
  const origin = req.headers.get('origin');
  if (origin) headers.origin = origin;
  const referer = req.headers.get('referer');
  if (referer) headers.referer = referer;

  return headers;
}

/** Set HttpOnly auth_token cookie on successful auth responses */
export function maybeSetAuthCookieFromBody(buf: ArrayBuffer, ok: boolean) {
  const cookies: string[] = [];
  try {
    const parsed = JSON.parse(Buffer.from(buf).toString('utf8'));
    if (ok && parsed?.success && parsed?.token) {
      const isSecure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
      cookies.push(
        [
          `auth_token=${encodeURIComponent(parsed.token)}`,
          'Path=/',
          'HttpOnly',
          'SameSite=Lax',
          isSecure ? 'Secure' : '',
        ]
          .filter(Boolean)
          .join('; ')
      );
    }
  } catch {
    // ignore JSON parse errors
  }
  return cookies;
}

/** Merge Set-Cookie arrays and prepare a Response with correct headers */
export function makePassthroughResponse(
  upstream: Response,
  buf: ArrayBuffer,
  setCookies: string[] = []
) {
  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
  setCookies.forEach((ck) => headers.append('set-cookie', ck));
  return new Response(buf, {
    status: upstream.status,
    headers,
  });
}
