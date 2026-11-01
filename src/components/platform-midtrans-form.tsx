"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, Power, Trash2 } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

export type MidtransMode = "sandbox" | "production";
type KeyStatus = {
  configured: boolean;
  source: "website" | "environment" | null;
  masked: string | null;
  unreadable?: boolean;
};
export type MidtransState = { mode: MidtransMode; enabled: boolean; keys: Record<MidtransMode, KeyStatus> };

const MODES: MidtransMode[] = ["sandbox", "production"];
const MODE_LABEL: Record<MidtransMode, string> = { sandbox: "Sandbox", production: "Production" };
const KEY_PREFIX: Record<MidtransMode, string> = { sandbox: "SB-Mid-server-…", production: "Mid-server-…" };

/** Satu form mengurus tiga hal: mode aktif, kunci per mode, dan sakelar aktif/nonaktif. */
export function PlatformMidtransForm({
  initialState,
  notificationUrl,
}: {
  initialState: MidtransState;
  /** URL webhook absolut dari APP_URL; disalin ke dashboard Midtrans. */
  notificationUrl: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [serverKey, setServerKey] = useState("");
  const [keyMode, setKeyMode] = useState<MidtransMode>(initialState.mode);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function send(payload: Record<string, unknown>, describe: (next: MidtransState) => string) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform/settings/midtrans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: MidtransState; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? "Perubahan gagal disimpan.");
      setState(body.data);
      setMessage(describe(body.data));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terjadi kesalahan.");
    } finally {
      setPending(false);
    }
  }

  async function saveKey() {
    const mode = keyMode;
    setServerKey("");
    await send({ serverKey, mode }, () => `Server Key ${MODE_LABEL[mode]} tersimpan terenkripsi.`);
  }

  const keyStatus = state.keys[keyMode];
  const activeKey = state.keys[state.mode];

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <div className="grid content-start gap-5">
        <div className="grid gap-2">
          <p className="text-[11px] font-semibold text-[#52615b]">Mode aktif</p>
          <div className="flex flex-wrap gap-2">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={state.mode === mode}
                disabled={pending || state.mode === mode}
                onClick={() => void send({ mode }, () => `Mode ${MODE_LABEL[mode]} aktif.`)}
                className={`h-9 rounded-full px-4 text-xs font-semibold transition disabled:opacity-60 ${
                  state.mode === mode ? "bg-brand-700 text-white" : "bubble-panel text-[#41524c] hover:bg-brand-50"
                }`}
              >
                {MODE_LABEL[mode]}
                {!state.keys[mode].configured && <span className="ml-1.5 font-normal opacity-70">(tanpa kunci)</span>}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-5 text-[#5c6a65]">
            Mode hanya bisa dipindah bila Server Key mode tujuan sudah tersimpan. Kunci tiap mode
            disimpan terpisah, jadi berpindah bolak-balik tidak menghapus kunci mana pun.
          </p>
        </div>

        <div className="grid gap-2 border-t border-brand-100 pt-4">
          <label className="block text-[11px] font-semibold text-[#52615b]" htmlFor="midtrans-key-mode">
            Server Key untuk mode
            <select
              id="midtrans-key-mode"
              value={keyMode}
              onChange={(event) => setKeyMode(event.target.value as MidtransMode)}
              className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none"
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABEL[mode]}
                </option>
              ))}
            </select>
            <input
              id="midtrans-server-key"
              type="password"
              autoComplete="new-password"
              value={serverKey}
              onChange={(event) => setServerKey(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none"
              placeholder={KEY_PREFIX[keyMode]}
            />
          </label>
          <p className="text-[11px] leading-5 text-[#5c6a65]">
            Kunci {MODE_LABEL[keyMode]} harus diawali <code>{KEY_PREFIX[keyMode]}</code>. Setelah
            disimpan kolom dikosongkan dan nilainya tidak pernah dikirim kembali ke browser.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveKey()}
              disabled={pending || !serverKey.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:cursor-progress disabled:opacity-60"
            >
              {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
              Simpan Server Key
            </button>
            {keyStatus.source === "website" && (
              <button
                type="button"
                onClick={() => void send({ removeKey: keyMode }, () => `Server Key ${MODE_LABEL[keyMode]} dihapus.`)}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-lg bubble-btn px-3 text-xs font-semibold text-[#7b4b43] hover:bg-[#fff7f5] disabled:opacity-60"
              >
                <Trash2 className="size-3.5" /> Hapus
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-2 border-t border-brand-100 pt-4">
          <p className="text-[11px] font-semibold text-[#52615b]">Fitur pembayaran online</p>
          <button
            type="button"
            aria-pressed={state.enabled}
            disabled={pending || (!state.enabled && !activeKey.configured)}
            onClick={() =>
              void send({ enabled: !state.enabled }, (next) =>
                next.enabled ? "Pembayaran online diaktifkan." : "Pembayaran online dinonaktifkan.",
              )
            }
            className={`inline-flex h-9 w-fit items-center gap-2 rounded-full px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              state.enabled ? "bg-brand-700 text-white hover:bg-brand-800" : "bubble-panel text-[#41524c] hover:bg-brand-50"
            }`}
          >
            <Power className="size-3.5" />
            {state.enabled ? "Aktif — klik untuk menonaktifkan" : "Nonaktif — klik untuk mengaktifkan"}
          </button>
          <p className="text-[11px] leading-5 text-[#5c6a65]">
            Saat nonaktif, checkout baru ditolak dan tombol bayar disembunyikan di dashboard pelanggan.
            Notifikasi untuk pembayaran yang sudah terlanjur masuk tetap diverifikasi dan dicatat.
          </p>
        </div>

        <div className="grid gap-2 border-t border-brand-100 pt-4">
          <p className="text-[11px] font-semibold text-[#52615b]">Payment Notification URL</p>
          <code className="block break-all rounded-lg bubble-field bg-white px-3 py-2 text-[11px] text-[#344440]">
            {notificationUrl}
          </code>
          <p className="text-[11px] leading-5 text-[#5c6a65]">
            Tempel persis di Midtrans: Settings → Configuration → Payment Notification URL. URL ini
            dihitung dari APP_URL, jadi ikut berubah bila domain deployment berubah. URL harus bisa
            dijangkau Midtrans (HTTPS, tanpa redirect) — alamat LAN seperti ini belum bisa.
          </p>
        </div>

        {error && <InlineNotice message={error} />}
        {message && <InlineNotice message={message} variant="success" />}
      </div>

      <div className="bubble-panel bg-brand-50 p-4 text-xs leading-5 text-[#64716c]">
        <p className="font-semibold text-[#344440]">Status koneksi</p>
        <p className="mt-2">
          {state.enabled ? "Pembayaran online aktif" : "Pembayaran online nonaktif"} · mode{" "}
          <span className="font-semibold">{MODE_LABEL[state.mode]}</span>
        </p>
        {MODES.map((mode) => {
          const status = state.keys[mode];
          return (
            <p key={mode} className="mt-2">
              <span className="font-semibold">{MODE_LABEL[mode]}:</span>{" "}
              {status.unreadable
                ? "kunci tersimpan tidak dapat dibuka — simpan ulang kuncinya"
                : status.configured
                  ? `terkonfigurasi dari ${status.source === "website" ? "website" : "environment"}`
                  : "belum ada kunci"}
              {status.masked && <span className="mt-0.5 block font-mono text-[11px]">{status.masked}</span>}
            </p>
          );
        })}
      </div>
    </div>
  );
}
