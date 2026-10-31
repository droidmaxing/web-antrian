"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type KeyStatus = {
  configured: boolean;
  source: "website" | "environment" | null;
  masked: string | null;
};

export function PlatformMidtransForm({ initialStatus }: { initialStatus: KeyStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [serverKey, setServerKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform/settings/midtrans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverKey }),
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: KeyStatus; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? "Server Key gagal disimpan.");
      setStatus(body.data);
      setServerKey("");
      setMessage("Server Key sandbox tersimpan terenkripsi.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform/settings/midtrans", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as
        | { data?: KeyStatus; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? "Server Key gagal dihapus.");
      setStatus(body.data);
      setMessage(body.data.configured ? "Kunci website dihapus; konfigurasi environment masih aktif." : "Konfigurasi Server Key dihapus.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <form onSubmit={save} className="grid content-start gap-3">
        <label className="block text-[11px] font-semibold text-[#52615b]" htmlFor="midtrans-server-key">
          Server Key sandbox
          <input
            id="midtrans-server-key"
            type="password"
            autoComplete="new-password"
            value={serverKey}
            onChange={(event) => setServerKey(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none"
            placeholder="SB-Mid-server-…"
            required
          />
        </label>
        <p className="text-[11px] leading-5 text-[#5c6a65]">
          Kunci hanya digunakan pada mode development (sandbox). Setelah disimpan, kolom akan dikosongkan dan nilai tidak pernah dikirim kembali.
        </p>
        {error && <InlineNotice message={error} />}
        {message && <InlineNotice message={message} variant="success" />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !serverKey} className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60">
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            Simpan Server Key
          </button>
          {status.source === "website" && (
            <button type="button" onClick={remove} disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bubble-btn px-3 text-xs font-semibold text-[#7b4b43] hover:bg-[#fff7f5] disabled:opacity-60">
              <Trash2 className="size-3.5" /> Hapus
            </button>
          )}
        </div>
      </form>
      <div className="bubble-panel bg-brand-50 p-4 text-xs leading-5 text-[#64716c]">
        <p className="font-semibold text-[#344440]">Status koneksi</p>
        <p className="mt-2">{status.configured ? `Terkonfigurasi dari ${status.source === "website" ? "website" : "environment"}.` : "Belum ada Server Key."}</p>
        {status.masked && <p className="mt-1 font-mono text-[11px]">{status.masked}</p>}
        <p className="mt-3 text-[11px] text-[#5c6a65]">Gunakan kunci sandbox yang diawali <code>SB-Mid-server-</code>. Jangan masukkan production key di mode ini.</p>
      </div>
    </div>
  );
}
