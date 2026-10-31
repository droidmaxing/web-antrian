"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

/**
 * Google sign-in leaves through the Auth.js OAuth redirect (not fetch), so the
 * whole page navigates away; `redirectTo` sends the operator back to "/", which
 * resolves either the dashboard or the workspace form.
 */
export function GoogleSignInButton({
  label = "Masuk dengan Google",
  redirectTo = "/",
}: {
  label?: string;
  redirectTo?: string;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void signIn("google", { redirectTo });
      }}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-semibold text-[#344440] transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-70 bubble-btn"
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
      )}
      {label}
    </button>
  );
}
