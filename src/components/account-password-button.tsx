"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, X } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { readApiError } from "@/lib/api-error";

/**
 * Ganti sandi akun yang sedang masuk dari mana pun di dashboard. Panelnya
 * menempel pada tombol pemicu supaya tidak perlu halaman terpisah.
 */
export function AccountPasswordButton({
  className,
  label = "Ubah kata sandi",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const repeat = String(data.get("repeatPassword") ?? "");
    setError("");
    setMessage("");
    if (newPassword !== repeat) {
      setError("Ulangi kata sandi baru dengan nilai yang sama.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        setError((await readApiError(response)).message);
        return;
      }
      form.reset();
      setMessage("Kata sandi diperbarui. Gunakan sandi baru saat masuk berikutnya.");
    } catch {
      setError("Tidak dapat menghubungi layanan. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setError("");
          setMessage("");
        }}
        aria-expanded={open}
        aria-label={label || "Ubah kata sandi"}
        title={label ? undefined : "Ubah kata sandi"}
        className={className ?? "flex w-full items-center gap-3 bubble-panel px-3 py-2.5 text-left text-sm font-medium text-[#4d5a56] transition hover:bg-brand-50"}
      >
        <KeyRound className="size-4" /> {label}
      </button>

      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 top-11 z-40 w-[300px] space-y-3 bubble-card bg-white p-4 text-left shadow-bubble-lift"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#5d6b67]">
              Ubah kata sandi
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup formulir ubah kata sandi"
              className="text-[#5d6b67] hover:text-[#344440]"
            >
              <X className="size-4" />
            </button>
          </div>

          <label className="block text-[11px] font-semibold text-[#52615b]">
            Kata sandi saat ini
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none"
            />
          </label>

          <label className="block text-[11px] font-semibold text-[#52615b]">
            Kata sandi baru (minimal 8 karakter)
            <span className="relative mt-1 block">
              <input
                name="newPassword"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                className="h-10 w-full rounded-lg bubble-field bg-white px-3 pr-10 text-xs text-[#344440] outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((current) => !current)}
                aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#626a67] hover:text-[#344440]"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </label>

          <label className="block text-[11px] font-semibold text-[#52615b]">
            Ulangi kata sandi baru
            <input
              name="repeatPassword"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              className="mt-1 h-10 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none"
            />
          </label>

          {error && <InlineNotice message={error} />}
          {message && <InlineNotice message={message} variant="success" />}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-progress disabled:opacity-70"
          >
            {pending && <LoaderCircle className="size-3.5 animate-spin" />}
            Simpan kata sandi baru
          </button>
        </form>
      )}
    </div>
  );
}
