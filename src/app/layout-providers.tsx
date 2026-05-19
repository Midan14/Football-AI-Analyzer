"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { initializeSentry } from "@/lib/sentry";

// Initialize Sentry
initializeSentry();

export function LayoutProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    }
  }, []);

  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}
