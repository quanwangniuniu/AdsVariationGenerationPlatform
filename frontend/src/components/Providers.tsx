// components/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import CsrfInitializer from "./CsrfInitializer";
import AuthTokenLifecycle from "./AuthTokenLifecycle";

/**
 * Application-wide providers wrapper
 * - SessionProvider: Authentication session management (NextAuth)
 * - QueryClientProvider: React Query for data fetching and caching
 * - CsrfInitializer: Initialize CSRF cookie on app load
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient instance per component mount (prevents SSR issues)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Default stale time: 5 minutes
            staleTime: 5 * 60 * 1000,
            // Keep unused data in cache for 10 minutes
            gcTime: 10 * 60 * 1000,
            // Retry failed requests once
            retry: 1,
            // Disable automatic refetch on window focus in development
            refetchOnWindowFocus: process.env.NODE_ENV === "production",
          },
          mutations: {
            // Retry mutations once on network errors
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <CsrfInitializer />
        <AuthTokenLifecycle />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
