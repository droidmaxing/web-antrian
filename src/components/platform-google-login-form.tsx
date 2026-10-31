"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, Power, Trash2 } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

export type GoogleLoginStatus = {
  configured: boolean;
  source: "website" | "environment" | null;
  clientId: string | null;
  masked: string | null;
  enabled: boolean;
};

/**
 * Kredensial "Masuk dengan Google" milik platform (bukan per bisnis): satu OAuth
 * client berlaku untuk seluruh deployment, jadi halaman pengaturan bisnis tidak
 * menyimpannya. Client Secret disimpan terenkripsi dan tidak pernah dikirim balik.
 */
export function PlatformGoogleLoginForm({
  initialStatus,
  redirectUri,
}: {
  initialStatus: GoogleLoginStatus;
  redirectUri: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function send(method: "PUT" | "DELETE", body?: unknown, success?: string) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform/settings/google-login", {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: GoogleLoginStatus; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? "Perubahan gagal disimpan.");
      setStatus(payload.data);
      setMessage(success ?? "Pengaturan Google diperbarui.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send("PUT", { clientId: clientId.trim(), clientSecret }, "Kredensial Google tersimpan. Login dengan Google aktif.");
    setClientId("");
    setClientSecret("");
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <form onSubmit={save} className="grid content-start gap-3">
        <label className="block text-[11px] font-semibold text-[#52615b]" htmlFor="google-client-id">
          Client ID
          <input
            id="google-client-id"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 font-mono text-xs text-[#344440] outline-none"
            placeholder="1234567890-abc.apps.googleusercontent.com"
            required
          />
        </label>
        <label className="block text-[11px] font-semibold text-[#52615b]" htmlFor="google-client-secret">
          Client Secret
          <input
            id="google-client-secret"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            autoComplete="new-password"
            className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 font-mono text-xs text-[#344440] outline-none"
            placeholder="GOCSPX-…"
            required
          />
        </label>
        <p className="text-[11px] leading-5 text-[#5c6a65]">
          Buat kredensial OAuth tipe <span className="font-semibold">Web application</span> di Google Cloud Console, lalu
          daftarkan <span className="font-mono">Authorized redirect URI</span> berikut:
        </p>
        <p className="break-all rounded-lg bubble-panel bg-brand-50 px-3 py-2 font-mono text-[11px] text-[#41524c]">
          {redirectUri}
        </p>
        {error && <InlineNotice message={error} />}
        {message && <InlineNotice message={message} variant="success" />}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || !clientId.trim() || !clientSecret}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60"
          >
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            {status.configured ? "Ganti kredensial" : "Simpan kredensial"}
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
              onClick={() => void send("DELETE", undefined, "Kredensial Google dihapus.")}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bubble-btn px-3 text-xs font-semibold text-[#7b4b43] hover:bg-[#fff7f5] disabled:opacity-60"
            >
              <Trash2 className="size-3.5" /> Hapus
            </button>
          )}
        </div>
      </form>

      <div className="bubble-panel bg-brand-50 p-4 text-xs leading-5 text-[#64716c]">
        <p className="font-semibold text-[#344440]">Status login Google</p>
        <p className="mt-2">
          {status.configured
            ? `Terkonfigurasi dari ${status.source === "website" ? "website" : "environment"}, ${status.enabled ? "aktif" : "nonaktif"}.`
            : "Belum dikonfigurasi — tombol Google disembunyikan di halaman masuk dan daftar."}
        </p>
        {status.clientId && <p className="mt-1 break-all font-mono text-[11px]">{status.clientId}</p>}
        {status.masked && <p className="font-mono text-[11px]">secret {status.masked}</p>}
        <p className="mt-3 text-[11px] text-[#5c6a65]">
          Nilai environment (<span className="font-mono">GOOGLE_CLIENT_ID</span> /{" "}
          <span className="font-mono">GOOGLE_CLIENT_SECRET</span>) dipakai sebagai cadangan selama database belum diisi.
        </p>
      </div>
    </div>
  );
}
