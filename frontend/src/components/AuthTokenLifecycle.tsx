"use client";

import { useEffect } from "react";
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_TAB_COUNT_KEY,
  appendAuthHeaders,
  clearAuthTokenStorage,
  syncAuthTokenToSession,
} from "@/lib/authHelpers";

const RETAIN_AUTH_ON_UNLOAD_KEY = "auth.retainOnUnload";

function parseCount(raw: string | null): number {
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function AuthTokenLifecycle() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cleaned = false;

    const incrementTabCount = () => {
      try {
        const current = parseCount(
          window.localStorage.getItem(AUTH_TOKEN_TAB_COUNT_KEY)
        );
        const next = current + 1;
        window.localStorage.setItem(
          AUTH_TOKEN_TAB_COUNT_KEY,
          String(next)
        );
      } catch {
        // ignore storage access issues
      }
    };

    const decrementTabCount = (shouldClearToken: boolean) => {
      let remainingTabs = 0;

      try {
        const current = parseCount(
          window.localStorage.getItem(AUTH_TOKEN_TAB_COUNT_KEY)
        );
        remainingTabs = Math.max(0, current - 1);

        if (remainingTabs > 0) {
          window.localStorage.setItem(
            AUTH_TOKEN_TAB_COUNT_KEY,
            String(remainingTabs)
          );
        } else {
          window.localStorage.removeItem(AUTH_TOKEN_TAB_COUNT_KEY);
        }
      } catch {
        remainingTabs = 0;
      }

      if (!shouldClearToken) {
        return;
      }

      if (remainingTabs <= 0) {
        try {
          window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        } catch {
          // ignore sessionStorage errors
        }

        clearAuthTokenStorage();
        try {
          const headers = appendAuthHeaders(
            { "Content-Type": "application/json" },
            { includeCsrf: true }
          );
          fetch("/api/account/logout/", {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({ reason: "tab_exit" }),
            keepalive: true,
          }).catch(() => {
            /* ignore network errors on unload */
          });
        } catch {
          /* ignore header build errors */
        }
      }
    };

    incrementTabCount();
    syncAuthTokenToSession();

    const shouldPreserveAuthOnUnload = () => {
      try {
        return window.sessionStorage.getItem(RETAIN_AUTH_ON_UNLOAD_KEY) === "1";
      } catch {
        return false;
      }
    };

    const clearPreserveFlag = () => {
      try {
        window.sessionStorage.removeItem(RETAIN_AUTH_ON_UNLOAD_KEY);
      } catch {
        // ignore sessionStorage errors
      }
    };

    const handleBeforeUnload = () => {
      if (cleaned) return;
      cleaned = true;
      const retainAuth = shouldPreserveAuthOnUnload();
      if (retainAuth) {
        clearPreserveFlag();
      }
      decrementTabCount(!retainAuth);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (!cleaned) {
        cleaned = true;
        decrementTabCount(false);
      }
    };
  }, []);

  return null;
}
