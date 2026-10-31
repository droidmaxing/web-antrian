"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeySquare, LoaderCircle, Power, Trash2 } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

export type GoogleApiKeyStatus = {
  configured: boolean;
  source: "website" | "environment" | null;
  masked: string | null;
  enabled: boolean;
};

export function PlatformGoogleApiKeyForm({ initialStatus }: { initialStatus: GoogleApiKeyStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function send(method: "PUT" | "DELETE", body?: unknown, success?: string) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform/settings/google", {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: GoogleApiKeyStatus; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? "Google API key gagal disimpan.");
      setStatus(payload.data);
      setMessage(success ?? "Pengaturan Google API key diperbarui.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send("PUT", { apiKey }, "Google API key tersimpan terenkripsi dan aktif.");
    setApiKey("");
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <form onSubmit={save} className="grid content-start gap-3">
        <label className="block text-[11px] font-semibold text-[#52615b]" htmlFor="google-api-key">
          Google API key
          <input
            id="google-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 font-mono text-xs text-[#344440] outline-none"
            placeholder="AIza…"
            required
          />
        </label>
        <p className="text-[11px] leading-5 text-[#5c6a65]">
          Kunci dari Google Cloud Console (API key, bukan OAuth client). Setelah disimpan, kolom dikosongkan dan nilainya
          tidak pernah dikirim kembali ke browser.
        </p>
        {error && <InlineNotice message={error} />}
        {message && <InlineNotice message={message} variant="success" />}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || !apiKey.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60"
          >
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeySquare className="size-3.5" />}
            {status.configured ? "Ganti API key" : "Simpan API key"}
          </button>
          {status.configured && (
            <button
              type="button"
              onClick={() => void send("PUT", { enabled: !status.enabled })}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bubble-btn px-3 text-xs font-semibold text-[#41524c] hover:bg-brand-50 disabled:opacity-60"
            >
              <Power className="size-3.5" /> {status.enabled ? "Nonaktifkan" : "Aktifkan"}
            </button>
          )}
          {status.source === "website" && (
            <button
              type="button"
              onClick={() => void send("DELETE", undefined, "Google API key dihapus.")}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bubble-btn px-3 text-xs font-semibold text-[#7b4b43] hover:bg-[#fff7f5] disabled:opacity-60"
            >
              <Trash2 className="size-3.5" /> Hapus
            </button>
          )}
        </div>
      </form>

      <div className="bubble-panel bg-brand-50 p-4 text-xs leading-5 text-[#64716c]">
        <p className="font-semibold text-[#344440]">Status kunci</p>
        <p className="mt-2">
          {status.configured
            ? `Terkonfigurasi dari ${status.source === "website" ? "website" : "environment"}, ${status.enabled ? "aktif" : "nonaktif"}.`
            : "Belum ada Google API key."}
        </p>
        {status.masked && <p className="mt-1 font-mono text-[11px]">{status.masked}</p>}
        <p className="mt-3 text-[11px] text-[#5c6a65]">
          Nilai environment <span className="font-mono">GOOGLE_API_KEY</span> dipakai sebagai cadangan selama database
          belum diisi.
        </p>
      </div>
    </div>
  );
}
