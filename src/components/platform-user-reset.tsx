"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";

/**
 * Reset sandi satu akun dari konsol. Sandi sementara hanya tampil sekali di sini
 * (server tidak menyimpannya dalam bentuk asli), lalu diserahkan manual.
 */
export function PlatformUserReset({ userId }: { userId: string }) {
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function reset() {
    if (!window.confirm("Reset sandi akun ini? Sandi lama langsung tidak berlaku.")) return;
    setPending(true);
    setError("");
    setPassword("");
    try {
      const response = await fetch(`/api/v1/platform/users/${userId}/password`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { data?: { temporaryPassword?: string }; error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Reset sandi gagal.");
      setPassword(body?.data?.temporaryPassword ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void reset()}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-[11px] font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-progress disabled:opacity-50"
      >
        {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
        Reset sandi
      </button>
      {password && (
        <p className="text-[11px] leading-4 text-[#3f5a52]">
          Sandi sementara: <span className="font-mono font-semibold">{password}</span>
          <span className="block text-[#606765]">Catat sekarang — hanya tampil sekali.</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] leading-4 text-[#b4473d]">
          {error}
        </p>
      )}
    </div>
  );
}
