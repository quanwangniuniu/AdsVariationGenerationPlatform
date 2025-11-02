/**
 * Axios Global Configuration
 *
 * Configures axios with CSRF token support for all requests.
 * Import this file at the top of any page/component that uses axios.
 */

import axios from 'axios';

const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  (typeof process !== 'undefined' && process.env.BACKEND_API_BASE) ||
  '';

if (API_BASE) {
  const trimmed = API_BASE.replace(/\/+$/, '');
  axios.defaults.baseURL = trimmed;
}

// Set default timeout
axios.defaults.timeout = 10000;

// Set default content type
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Enable credentials for cross-origin requests
axios.defaults.withCredentials = true;

/**
 * Extract CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // SSR safety

  const name = 'csrftoken';
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Request Interceptor: Add CSRF token to mutation requests
 */
axios.interceptors.request.use(
  (config) => {
    const method = config.method?.toLowerCase();
    const headers = config.headers ?? {};
    const setHeader = (key: string, value: string) => {
      if (typeof (headers as any).set === 'function') {
        (headers as any).set(key, value);
      } else {
        (headers as Record<string, string>)[key] = value;
      }
    };
    const hasHeader = (key: string) => {
      if (typeof (headers as any).has === 'function') {
        return (headers as any).has(key);
      }
      const lowerKey = key.toLowerCase();
      return Object.keys(headers as Record<string, string>).some((existing) => existing.toLowerCase() === lowerKey);
    };

    // Log request for debugging
    console.log(`[Axios] ${config.method?.toUpperCase()} ${config.url}`);

    // Browsers disallow custom Referer headers; skip setting it to avoid "Refused to set unsafe header"
    if (!hasHeader('X-Requested-With')) {
      setHeader('X-Requested-With', 'XMLHttpRequest');
    }

    // Add CSRF token for state-changing requests
    if (method && ['post', 'put', 'patch', 'delete'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        setHeader('X-CSRFToken', csrfToken);
        console.log(`[Axios] Added CSRF token to ${method.toUpperCase()} request`);
      } else {
        console.warn(`[Axios] CSRF token not found for ${method.toUpperCase()} request`);
      }
    }

    return config;
  },
  (error) => {
    console.error('[Axios] Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor: Handle errors
 */
axios.interceptors.response.use(
  (response) => {
    // Successful response
    return response;
  },
  (error) => {
    // Log error details
    if (error.response) {
      console.error(`[Axios] Response error ${error.response.status}:`, error.response.data);

      // Handle CSRF errors specifically
      if (error.response.status === 403 && error.response.data?.detail?.includes('CSRF')) {
        console.error('[Axios] CSRF validation failed. Ensure CSRF cookie is set by calling /api/account/csrf/ first.');
      }
    } else if (error.request) {
      console.error('[Axios] No response received:', error.request);
    } else {
      console.error('[Axios] Request setup error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default axios;
