"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, LockKeyholeOpen } from "lucide-react";

/**
 * Suspends or reactivates one workspace. The console owns the mutation so the
 * page itself stays a server component; the API is the same protected PATCH the
 * console links to in the docs.
 */
export function PlatformBusinessStatus({
  businessId,
  active,
}: {
  businessId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/platform/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, active: !active }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Status workspace gagal diubah.");
      }
      router.refresh();
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
        onClick={() => void toggle()}
        disabled={pending}
        aria-busy={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-progress disabled:opacity-50 ${
          active
            ? "border-[#e0a99f] text-[#b4553f] hover:bg-[#fdf4f2]"
            : "border-brand-200 text-brand-600 hover:bg-brand-50"
        }`}
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : active ? (
          <LockKeyhole className="size-3.5" />
        ) : (
          <LockKeyholeOpen className="size-3.5" />
        )}
        {active ? "Suspend" : "Aktifkan"}
      </button>
      {error && (
        <p role="alert" className="text-[11px] leading-4 text-[#b4473d]">
          {error}
        </p>
      )}
    </div>
  );
}
