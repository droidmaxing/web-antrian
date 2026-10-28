"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Printer, RefreshCw, TicketCheck } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type QueueStatus = {
  ticketNumber: string;
  status: string;
  service: string;
  business: string;
  branch: string;
  waitingAhead: number;
  estimateMinutes: number;
  issuedAt: string;
  timezone: string;
};

const statusLabels: Record<string, string> = {
  WAITING: "Menunggu giliran",
  CALLED: "Silakan menuju loket",
  SERVING: "Sedang dilayani",
  COMPLETED: "Layanan selesai",
  SKIPPED: "Antrean dilewati",
  CANCELLED: "Antrean dibatalkan",
  NO_SHOW: "Tidak terdeteksi saat dipanggil",
};

export function PublicQueueStatus({ token, statusUrl }: { token: string; statusUrl: string }) {
  const [data, setData] = useState<QueueStatus | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/v1/public/queues/${token}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "Status antrean tidak tersedia.");
        if (!cancelled) {
          setData(result.data);
          setError("");
          setUpdatedAt(new Date());
        }
      } catch (statusError) {
        if (!cancelled) {
          setError(
            statusError instanceof Error
              ? statusError.message
              : "Gagal memuat status antrean.",
          );
        }
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-[#e8eeeb] bg-white p-5 shadow-[0_18px_60px_rgba(28,60,47,.08)]">
        <InlineNotice message={error} />
        <Link
          href="/"
          className="mt-4 flex h-10 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Kembali ke halaman utama
        </Link>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#e8eeeb] bg-white shadow-[0_18px_60px_rgba(28,60,47,.08)]">
      <div className="bg-brand-700 px-6 pb-7 pt-7 text-center text-white">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/15">
          <TicketCheck className="size-6" />
        </div>
        <p className="mt-4 text-xs text-white/70">Nomor antrean Anda</p>
        <p className="mt-1 text-4xl font-semibold tracking-[-.04em]">
          {data?.ticketNumber ?? "—"}
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-[#a8e6ce]" />
          {data ? statusLabels[data.status] ?? data.status : "Memuat status..."}
        </p>
      </div>
      <div className="space-y-4 p-6">
        {error && (
          <InlineNotice message={error} />
        )}
        <div className="rounded-xl bg-[#f5f8f6] p-4">
          <p className="text-[10px] font-medium uppercase tracking-[.1em] text-[#9aa5a1]">
            Layanan
          </p>
          <p className="mt-1 text-sm font-semibold text-[#344440]">
            {data?.service ?? "—"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#e9edeb] p-4">
            <p className="text-[10px] text-[#9aa5a1]">Antrean di depan</p>
            <p className="mt-1 text-2xl font-semibold text-[#344440]">
              {data?.waitingAhead ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-[#e9edeb] p-4">
            <p className="text-[10px] text-[#9aa5a1]">Estimasi tunggu</p>
            <p className="mt-1 flex items-baseline gap-1 text-2xl font-semibold text-[#344440]">
              {data?.estimateMinutes ?? "—"}
              <span className="text-[10px] font-medium text-[#8a9691]">menit</span>
            </p>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-dashed border-[#cfd8d4] p-4">
          <div>
            <p className="text-xs font-semibold text-[#344440]">Cetak nomor antrean</p>
            <p className="mt-0.5 text-[10px] text-[#8a9691]">
              Struk 80mm (printer termal). Tunjukkan struk atau nomor ini saat dipanggil.
            </p>
          </div>
          {/* Pratinjau apa adanya: elemen ini yang tercetak, sisanya disembunyikan
              lewat aturan @media print di globals.css. */}
          <div className="struk-80mm mx-auto overflow-hidden rounded-lg border border-[#e9edeb] px-3">
            <p className="text-center font-semibold uppercase tracking-[.08em]">
              {data?.business ?? "—"}
            </p>
            <p className="text-center text-[10px]">{data?.branch ?? ""}</p>
            <p className="my-2 border-t border-dashed border-black/40" />
            <p className="text-center text-[10px] uppercase tracking-[.14em]">
              Nomor antrean
            </p>
            <p className="mt-1 text-center text-3xl font-bold tracking-[.12em]">
              {data?.ticketNumber ?? "—"}
            </p>
            <p className="my-2 border-t border-dashed border-black/40" />
            <div className="space-y-0.5">
              <div className="flex justify-between gap-2">
                <span>Layanan</span>
                <span className="text-right font-semibold">{data?.service ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Status</span>
                <span className="text-right font-semibold">
                  {data ? statusLabels[data.status] ?? data.status : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Diambil</span>
                <span className="text-right">
                  {data
                    ? new Date(data.issuedAt).toLocaleString("id-ID", {
                        timeZone: data.timezone,
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Antrean di depan</span>
                <span className="text-right">{data?.waitingAhead ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Estimasi tunggu</span>
                <span className="text-right">±{data?.estimateMinutes ?? "—"} menit</span>
              </div>
            </div>
            <p className="my-2 border-t border-dashed border-black/40" />
            <p className="text-center text-[10px] break-all">
              Status: {statusUrl || `/q/status/${token}`}
            </p>
            <p className="mt-1 text-center text-[10px]">
              Mohon menunggu sampai nomor ini dipanggil.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-700 text-sm font-semibold text-brand-700 transition hover:bg-[#eef6f1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="size-4" />
            Cetak struk 80mm
          </button>
        </div>
        <p className="flex items-center justify-center gap-1.5 pt-1 text-[10px] text-[#a0aaa6]">
          <RefreshCw className="size-3" />
          {updatedAt
            ? `Diperbarui ${updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · diperbarui otomatis`
            : "Memuat antrean"}
        </p>
        <div className="flex gap-2 rounded-xl bg-[#eef6f1] p-3 text-[11px] leading-5 text-[#658172]">
          <Clock3 className="mt-0.5 size-4 shrink-0" />
          Estimasi waktu dapat berubah mengikuti kondisi pelayanan.
        </div>
      </div>
    </section>
  );
}
