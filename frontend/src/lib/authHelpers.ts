type HeaderInput =
  | Headers
  | Array<[string, string]>
  | Record<string, string | number | boolean | string[]>
  | undefined
  | null;

function toStringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(', ');
  }
  return String(value);
}

const CSRF_TOKEN_PATTERN = /^(?:[A-Za-z0-9]{32}|[A-Za-z0-9]{64})$/;
let inflightCsrfFetch: Promise<string | null> | null = null;


export const AUTH_TOKEN_STORAGE_KEY = 'authToken';
export const AUTH_TOKEN_TAB_COUNT_KEY = 'authToken.openTabs';

function safeSetItem(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore storage quota / access errors
  }
}

function safeRemoveItem(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore storage quota / access errors
  }
}

function safeGetItem(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function persistAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  safeSetItem(window.sessionStorage, AUTH_TOKEN_STORAGE_KEY, token);
  safeSetItem(window.localStorage, AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearAuthTokenStorage() {
  if (typeof window === 'undefined') return;
  safeRemoveItem(window.sessionStorage, AUTH_TOKEN_STORAGE_KEY);
  safeRemoveItem(window.localStorage, AUTH_TOKEN_STORAGE_KEY);
  safeRemoveItem(window.localStorage, AUTH_TOKEN_TAB_COUNT_KEY);
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const sessionToken = safeGetItem(window.sessionStorage, AUTH_TOKEN_STORAGE_KEY);
  if (sessionToken) return sessionToken;
  return safeGetItem(window.localStorage, AUTH_TOKEN_STORAGE_KEY);
}

export function syncAuthTokenToSession() {
  if (typeof window === 'undefined') return;
  const hasSession = safeGetItem(window.sessionStorage, AUTH_TOKEN_STORAGE_KEY);
  if (hasSession) return;
  const localToken = safeGetItem(window.localStorage, AUTH_TOKEN_STORAGE_KEY);
  if (localToken) {
    safeSetItem(window.sessionStorage, AUTH_TOKEN_STORAGE_KEY, localToken);
  }
}


function normalizeCsrfToken(token?: unknown): string | undefined {
  if (typeof token !== 'string') return undefined;
  const trimmed = token.trim();
  return CSRF_TOKEN_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function headersInitToRecord(headers?: HeaderInput): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (typeof value === 'undefined' || value === null) continue;
      result[key] = toStringValue(value);
    }
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined' || value === null) continue;
    result[key] = toStringValue(value);
  }

  return result;
}

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  const normalized = normalizeCsrfToken(decoded);
  if (!normalized) {
    document.cookie = 'csrftoken=; Max-Age=0; path=/';
    return null;
  }
  return normalized;
}

export function appendAuthHeaders(
  headers: HeaderInput = {},
  options: { includeCsrf?: boolean } = {}
): Record<string, string> {
  const next = headersInitToRecord(headers);

  const findHeaderKey = (searchKey: string) =>
    Object.keys(next).find((key) => key.toLowerCase() === searchKey.toLowerCase());

  const hasHeader = (searchKey: string) =>
    Boolean(findHeaderKey(searchKey));

  if (options.includeCsrf) {
    const existingKey = findHeaderKey('X-CSRFToken');
    if (existingKey) {
      const normalized = normalizeCsrfToken(next[existingKey]);
      if (normalized) {
        next[existingKey] = normalized;
      } else {
        delete next[existingKey];
      }
    }
    if (!findHeaderKey('X-CSRFToken')) {
      const csrf = getCsrfTokenFromCookie();
      if (csrf) {
        next['X-CSRFToken'] = csrf;
      }
    }
    if (!hasHeader('X-Requested-With')) {
      next['X-Requested-With'] = 'XMLHttpRequest';
    }
  }

  if (typeof window !== 'undefined' && !hasHeader('Referer')) {
    next['Referer'] = window.location.href;
  }

  return next;
}

async function fetchAndStoreCsrfToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch('/api/account/csrf/', {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return null;

    try {
      const cloned = response.clone();
      const data = await cloned.json();
      const token = normalizeCsrfToken(data?.csrfToken);
      if (token) return token;
    } catch {
      // ignore JSON parse errors
    }

    const headerToken = normalizeCsrfToken(response.headers.get('x-csrftoken'));
    if (headerToken) return headerToken;

    return getCsrfTokenFromCookie();
  } catch {
    return null;
  }
}

export async function ensureValidCsrfToken(): Promise<string | null> {
  const existing = getCsrfTokenFromCookie();
  if (existing) return existing;

  if (!inflightCsrfFetch) {
    inflightCsrfFetch = fetchAndStoreCsrfToken().finally(() => {
      inflightCsrfFetch = null;
    });
  }

  return inflightCsrfFetch;
}

export function redirectToAuthWithNext(delayMs = 0) {
  if (typeof window === 'undefined') return;
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  const go = () => {
    window.location.href = `/auth?next=${next}`;
  };
  if (delayMs > 0) setTimeout(go, delayMs);
  else go();
}

export async function verifySession(): Promise<boolean> {
  try {
    const resp = await fetch('/api/account/verify/', {
      method: 'GET',
      credentials: 'include',
    });
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => null);
    return Boolean(data?.success);
  } catch {
    return false;
  }
}
