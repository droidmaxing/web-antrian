"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

/**
 * Ends the session, then navigates relative to /login. Same approach as
 * handleSignOut in dashboard.tsx: signing out with a callbackUrl lets Auth.js
 * build an absolute URL server-side, which can point at a different origin than
 * the one the operator is browsing.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await signOut({ redirect: false });
        } finally {
          router.replace("/login");
          router.refresh();
        }
      }}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-xl border border-[#e9edeb] px-3.5 py-2 text-xs font-semibold text-[#4d5a56] transition hover:border-[#e0a99f] hover:bg-[#fdf4f2] hover:text-[#b4553f]"
      }
    >
      <LogOut className="size-4" /> Keluar
    </button>
  );
}
