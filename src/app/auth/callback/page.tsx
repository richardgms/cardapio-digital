"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Client-side auth callback — handles PKCE code exchange in the same browser
// context that opened the magic link (Safari or the PWA itself).
//
// Why client-side instead of the /api/auth/callback server route?
// The PKCE code_verifier is stored as a cookie by createBrowserClient.
// On iOS, when the magic link opens in Safari (different from the PWA context),
// the exchange must happen client-side in that same Safari context where the
// cookie is readable. A server-side handler also works now that we set maxAge
// on the verifier cookie, but this page is the belt-and-suspenders layer.

export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        const message = url.searchParams.get("error_description") ?? errorParam;
        router.replace(`/admin/login?error=auth&message=${encodeURIComponent(message)}`);
        return;
      }

      const supabase = createClient();

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace("/admin");
          return;
        }
        // Exchange failed (e.g. verifier not in this context — edge case on older iOS).
        // Try checking if a session already exists (set by a parallel callback execution).
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace("/admin");
          return;
        }
        router.replace(
          `/admin/login?error=auth&message=${encodeURIComponent("Link expirado ou já utilizado. Solicite um novo.")}`
        );
        return;
      }

      // No code in URL — check if session already exists (hash-based implicit flow fallback).
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/admin");
        return;
      }

      router.replace(`/admin/login?error=auth&message=${encodeURIComponent("Link inválido. Solicite um novo.")}`);
    };

    run();
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Autenticando...</p>
      </div>
    </div>
  );
}
