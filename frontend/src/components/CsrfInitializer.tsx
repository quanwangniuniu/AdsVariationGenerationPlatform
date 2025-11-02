'use client';

import { useEffect } from 'react';

/**
 * CSRF Initializer Component
 *
 * This component runs on app initialization to fetch CSRF token
 * from the backend and set the CSRF cookie in the browser.
 *
 * This is required for Django's CSRF protection to work properly.
 * Without this, POST/PUT/PATCH/DELETE requests will fail with:
 * "CSRF Failed: CSRF cookie not set."
 */
export default function CsrfInitializer() {
  useEffect(() => {
    // Only run once on mount
    const initCsrf = async () => {
      try {
        // Call the CSRF endpoint to set the cookie
        // This endpoint uses @ensure_csrf_cookie decorator
        await fetch('/api/account/csrf/', {
          method: 'GET',
          credentials: 'include', // Important: include cookies
        });

        console.log('[CSRF] Cookie initialized successfully');
      } catch (error) {
        console.error('[CSRF] Failed to initialize cookie:', error);
      }
    };

    initCsrf();
  }, []);

  // This component doesn't render anything
  return null;
}
