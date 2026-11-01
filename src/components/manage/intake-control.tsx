"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Lock, Unlock } from "lucide-react";
import { readApiError } from "@/lib/api-error";

type IntakeMode = "AUTO" | "OPEN" | "CLOSED";

/**
 * Tombol buka/tutup pengambilan nomor di lokasi. Terbuka untuk semua peran karena
 * keputusan ini diambil petugas di depan, bukan pemilik data cabang.
 */
export function IntakeControl({
  businessSlug,
  branchId,
  open,
  mode,
  reason,
}: {
  businessSlug: string;
  branchId: string;
  open: boolean;
  mode: IntakeMode;
  reason: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setMode(next: IntakeMode) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/branches/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, mode: next }),
      });
      if (!response.ok) {
        const failure = await readApiError(response);
        throw new Error(failure.message);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal mengubah status ambil nomor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span
          title={reason}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            open
              ? "bg-brand-50 text-brand-700"
              : "bg-[#fdf1ee] text-[#b0533e]"
          }`}
        >
          <span className={`size-1.5 rounded-full ${open ? "bg-brand-600" : "bg-[#d65f4a]"}`} />
          Ambil nomor: {open ? "buka" : "tutup"}
        </span>
        {open ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setMode("CLOSED")}
            className="flex items-center gap-1.5 rounded-full bubble-btn px-3 py-1.5 text-[11px] font-semibold text-[#344440] disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
            Tutup
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setMode("OPEN")}
            className="flex items-center gap-1.5 rounded-full bg-brand-700 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />}
            Buka
          </button>
        )}
        {mode !== "AUTO" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setMode("AUTO")}
            title="Kembali mengikuti jam operasional cabang"
            className="rounded-full bubble-btn px-3 py-1.5 text-[11px] font-semibold text-[#53615b] disabled:opacity-60"
          >
            Ikuti jam
          </button>
        )}
      </div>
      <p className="max-w-[280px] truncate text-[10px] text-[#67706d]" title={reason}>
        {error || reason}
      </p>
    </div>
  );
}
