"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  X,
} from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { initials } from "@/lib/initials";
import { readApiError } from "@/lib/api-error";

type Section = "menu" | "password";

/**
 * Menu akun di navbar. Satu tombol (avatar berisi inisial) membuka modal berisi
 * identitas, pilihan "Ubah kata sandi" (formulir pindah di dalam modal yang
 * sama, tanpa menutup), dan "Keluar" bila pemanggil menyediakan handler keluar.
 *
 * Modal, bukan dropdown: formulir kata sandi butuh ruang dan tidak boleh
 * terpotong tepi viewport di layar sempit. Panel dirender lewat portal ke
 * `document.body`: header navbar memakai `backdrop-blur`, yang menjadikannya
 * containing block bagi keturunan `fixed`, sehingga tanpa portal kartu ini
 * terjepit di dalam bilah header.
 */
export function AccountMenuButton({
  userName,
  roleLabel,
  businessName,
  variant = "trigger",
  className,
}: {
  userName: string;
  roleLabel: string;
  businessName: string;
  /** `card` mengisi penuh lebar induknya (footer sidebar), `trigger` = navbar. */
  variant?: "trigger" | "card";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>("menu");
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const focusedSection = useRef<Section | null>(null);

  const close = () => {
    setOpen(false);
    setSection("menu");
  };

  // Escape menutup, Tab berputar di dalam modal, latar tidak ikut bergulir, dan
  // fokus kembali ke peluncur modal saat ditutup.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSection("menu");
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panelRef.current?.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  // Fokus pindah mengikuti bagian yang tampil: pilihan pertama saat modal
  // dibuka, tombol "Kembali" saat masuk formulir kata sandi.
  useEffect(() => {
    if (!open) {
      focusedSection.current = null;
      return;
    }
    if (focusedSection.current === section) return;
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    if (!node) return;
    node.focus();
    focusedSection.current = section;
  }, [open, section]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Buka menu akun ${userName}`}
        className={
          className ??
          (variant === "card"
            ? "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-brand-50"
            : "flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-brand-50")
        }
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          {initials(userName)}
        </span>
        {variant === "card" && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{userName}</span>
            <span className="mt-0.5 block truncate text-[11px] text-[#65726d]">{roleLabel}</span>
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-[#626966]" aria-hidden />
      </button>

      {open &&
        createPortal(
        <div
          /* Tanpa lapisan gelap/blur: modal cukup mengambang di atas halaman
             (bayangan bubble-card yang mengangkatnya), isi halaman tetap
             terbaca. Wrapper tetap menangkap klik luar untuk menutup. */
          className="fixed inset-0 z-50 overflow-y-auto"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              className="w-full max-w-[380px] bubble-card bubble-pop bg-white p-5 text-left shadow-bubble-lift outline-none"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {initials(userName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p id={headingId} className="truncate text-sm font-semibold">
                    {userName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[#65726d]">
                    {roleLabel} · {businessName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Tutup menu akun"
                  className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded-lg text-[#626966] transition hover:bg-brand-50 hover:text-[#344440]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              {section === "menu" ? (
                <div className="mt-4 space-y-1">
                  <button
                    type="button"
                    data-section="menu"
                    onClick={() => setSection("password")}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#3f4b47] transition hover:bg-brand-50"
                  >
                    <KeyRound className="size-4 shrink-0 text-brand-600" aria-hidden />
                    Ubah kata sandi
                    <ChevronRight className="ml-auto size-4 text-[#65716d]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await signOut({ redirect: false });
                      } finally {
                        // Navigasi relatif: tetap di origin yang sedang dibuka.
                        router.replace("/login");
                        router.refresh();
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#3f4b47] transition hover:bg-[#fdf4f2] hover:text-[#b0533e]"
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    Keluar
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    data-section="password"
                    onClick={() => setSection("menu")}
                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden /> Kembali
                  </button>
                  <AccountPasswordForm />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Formulir kata sandi di dalam modal akun; tidak punya bingkai sendiri. */
function AccountPasswordForm() {
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

  const field = "h-11 w-full bubble-field bg-white px-3 text-[13px] text-[#344440] outline-none";
  const label = "block text-[11px] font-semibold text-[#52615b]";

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <h2 className="text-sm font-semibold">Ubah kata sandi</h2>
      <p className="text-[11px] leading-5 text-[#65726d]">
        Masukkan kata sandi lama, lalu kata sandi baru minimal 8 karakter. Sesi di perangkat lain
        tidak otomatis keluar.
      </p>

      <label className={label}>
        Kata sandi saat ini
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className={`mt-1 ${field}`}
        />
      </label>

      <label className={label}>
        Kata sandi baru
        <span className="relative mt-1 block">
          <input
            name="newPassword"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            className={`pr-10 ${field}`}
          />
          <button
            type="button"
            onClick={() => setShow((current) => !current)}
            aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#626a67] transition hover:bg-brand-50 hover:text-[#344440]"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </span>
      </label>

      <label className={label}>
        Ulangi kata sandi baru
        <input
          name="repeatPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          className={`mt-1 ${field}`}
        />
      </label>

      {error && <InlineNotice message={error} />}
      {message && <InlineNotice message={message} variant="success" />}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-progress disabled:opacity-70"
      >
        {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        Simpan kata sandi baru
      </button>
    </form>
  );
}
