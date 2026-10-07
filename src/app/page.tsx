"use client";

/**
 * ASM Manpower Management System — single-page application entry.
 * 
 * Architecture (adapted from the Supabase spec to this environment):
 *   UI (this SPA) → Feature view components → API route handlers (server-side
 *   authorization + business logic) → Prisma → SQLite.
 * 
 * The browser is never trusted for authorization: every API route re-checks
 * the session and menu permissions server-side.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import type { AuthUser } from "@/types/manpower";
import { LoginScreen } from "@/components/manpower/login-screen";
import { AppShell } from "@/components/manpower/app-shell";

export default function Page() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiGet<AuthUser>("/api/auth/me");
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setUser(null);
  }, [setUser]);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading ASM Manpower System…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppShell user={user} onLogout={handleLogout} />;
}
