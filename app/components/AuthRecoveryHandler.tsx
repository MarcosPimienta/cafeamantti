"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function AuthRecoveryHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // 1. Check if the URL has ?code= parameter
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code && !window.location.pathname.startsWith("/auth/callback")) {
        window.location.href = `/auth/callback?code=${encodeURIComponent(code)}&next=/recovery/reset-password`;
        return;
      }

      // 2. Check if the URL hash contains recovery token directly
      if (window.location.hash) {
        const hash = window.location.hash;
        if (hash.includes("type=recovery")) {
          // Forward to the reset password page with the hash
          if (!window.location.pathname.startsWith("/recovery/reset-password")) {
            router.push(`/recovery/reset-password${hash}`);
            return;
          }
        }
      }
    }

    // 2. Listen to Supabase Auth State changes for PASSWORD_RECOVERY event
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/recovery/reset-password");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
