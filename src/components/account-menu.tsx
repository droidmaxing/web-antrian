"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, X } from "lucide-react";
import { initials } from "@/lib/initials";

/**
 * Menu akun di navbar. Satu tombol (avatar berisi inisial) membuka modal berisi
 * identitas dan pilihan "Keluar".
 *
 * Modal, bukan dropdown: kartu identitas butuh ruang dan tidak boleh terpotong
 * tepi viewport di layar sempit.
 */
export function AccountMenu({
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
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape menutup, Tab berputar di dalam modal, latar tidak ikut bergulir, dan
  // fokus kembali ke peluncur modal saat ditutup.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
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

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#182321]/45 backdrop-blur-[3px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              tabIndex={-1}
              className="w-full max-w-[380px] bubble-card bg-white p-5 text-left shadow-bubble-lift outline-none"
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
                  onClick={() => setOpen(false)}
                  aria-label="Tutup menu akun"
                  className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded-lg text-[#626966] transition hover:bg-brand-50 hover:text-[#344440]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <div className="mt-4">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
