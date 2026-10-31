"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  QrCode,
  Tv2,
} from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type LinkResource = { label: string; url: string };

export function AccessLinks({
  businessSlug,
  branchId,
  qrEnabled,
  displayEnabled,
  bookingEnabled,
}: {
  businessSlug: string;
  branchId: string;
  qrEnabled: boolean;
  displayEnabled: boolean;
  bookingEnabled: boolean;
}) {
  const [busy, setBusy] = useState<"qr" | "display" | "booking" | null>(null);
  const [resource, setResource] = useState<LinkResource | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function create(kind: "qr" | "display" | "booking") {
    setBusy(kind);
    setError("");
    setResource(null);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/${
          kind === "qr"
            ? "qr-tokens"
            : kind === "display"
              ? "displays"
              : "booking-tokens"
        }`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "qr"
              ? { branchId }
              : kind === "display"
                ? { branchId, name: `Display ${new Date().toLocaleDateString("id-ID")}` }
                : { branchId },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message ?? "Tautan gagal dibuat.");
      }
      const path =
        kind === "qr"
          ? result.data.url
          : kind === "display"
            ? `/display/${result.data.token}`
            : result.data.url;
      const origin = window.location.origin;
      setResource({
        label:
          kind === "qr"
            ? "QR antrean"
            : kind === "display"
              ? "TV Display"
              : "Booking online",
        url: new URL(path, origin).toString(),
      });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Terjadi kesalahan.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!resource) return;
    try {
      await navigator.clipboard.writeText(resource.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Tautan tidak dapat disalin oleh browser ini. Salin tautan secara manual.");
    }
  }

  return (
    <section className="bubble-card p-5 shadow-bubble-sm md:p-6">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-.02em]">Akses pelanggan & display</h2>
        <p className="mt-1 text-xs text-[#66736e]">
          Tautan bertoken aman dibuat hanya saat diminta.
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => void create("qr")}
          disabled={!qrEnabled || busy !== null}
          className="flex items-center gap-3 bubble-panel p-4 text-left transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            {busy === "qr" ? <LoaderCircle className="size-5 animate-spin" /> : <QrCode className="size-5" />}
          </span>
          <span>
            <span className="block text-xs font-semibold text-brand-800">Buat QR antrean</span>
            <span className="mt-1 block text-[11px] text-[#66736e]">
              {qrEnabled ? "Buat tautan baru untuk dicetak." : "Fitur antrean QR sedang nonaktif."}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void create("booking")}
          disabled={!bookingEnabled || busy !== null}
          className="flex items-center gap-3 bubble-panel p-4 text-left transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-100 text-accent-800">
            {busy === "booking" ? <LoaderCircle className="size-5 animate-spin" /> : <CalendarDays className="size-5" />}
          </span>
          <span>
            <span className="block text-xs font-semibold text-brand-800">Buat link booking</span>
            <span className="mt-1 block text-[11px] text-[#66736e]">
              {bookingEnabled ? "Bagikan jadwal reservasi online." : "Fitur booking sedang nonaktif."}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void create("display")}
          disabled={!displayEnabled || busy !== null}
          className="flex items-center gap-3 bubble-panel p-4 text-left transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#f1eff9] text-[#8071a8]">
            {busy === "display" ? <LoaderCircle className="size-5 animate-spin" /> : <Tv2 className="size-5" />}
          </span>
          <span>
            <span className="block text-xs font-semibold text-brand-800">Buat TV Display</span>
            <span className="mt-1 block text-[11px] text-[#66736e]">
              {displayEnabled ? "Tautan fullscreen khusus cabang." : "Fitur TV Display sedang nonaktif."}
            </span>
          </span>
        </button>
      </div>
      {error && (
        <InlineNotice message={error} className="mt-4" />
      )}
      {resource && (
        <div className="mt-4 bubble-panel bg-brand-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-800">{resource.label} berhasil dibuat</p>
              <p className="mt-1 truncate text-[11px] text-brand-600">{resource.url}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => void copyLink()}
                className="flex size-8 items-center justify-center rounded-lg bubble-btn bg-white text-brand-600 hover:bg-brand-50"
                aria-label="Salin tautan"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                className="flex size-8 items-center justify-center rounded-lg bubble-btn bg-white text-brand-600 hover:bg-brand-50"
                aria-label="Buka tautan"
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-brand-500">
            Simpan tautan ini dengan aman. Token tidak ditampilkan lagi setelah panel ditutup.
          </p>
        </div>
      )}
    </section>
  );
}
