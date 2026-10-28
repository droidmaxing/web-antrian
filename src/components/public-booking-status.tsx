"use client";

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";
import { InlineNotice } from "@/components/inline-notice";

type BookingInfo = {
  id: string;
  status: string;
  scheduledAt: string;
  timezone: string;
  branch: string;
  service: string;
  queue: { ticketNumber: string; status: string } | null;
};

const labels: Record<string, string> = {
  PENDING: "Menunggu konfirmasi",
  CONFIRMED: "Booking dikonfirmasi",
  CHECKED_IN: "Anda sudah check-in",
  COMPLETED: "Kunjungan selesai",
  CANCELLED: "Booking dibatalkan",
  NO_SHOW: "Tidak hadir",
};

export function PublicBookingStatus({ token }: { token: string }) {
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    async function loadStatus() {
      try {
        const response = await fetch(
          `/api/v1/public/bookings/${token}?status=1`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message ?? "Booking tidak ditemukan.");
        }
        if (!stopped) {
          setBooking(result.data);
          setError("");
        }
      } catch (loadError) {
        if (!stopped) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Status booking gagal dimuat.",
          );
        }
      }
    }
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 20_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (error && !booking) {
    return (
      <div className="rounded-2xl border border-[#e8eeeb] bg-white p-5 shadow-[0_18px_60px_rgba(28,60,47,.08)]">
        <InlineNotice message={error} />
        <Link
          href="/login"
          className="mt-4 flex h-10 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Kembali ke halaman utama
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#83918b]">
        <LoaderCircle className="size-4 animate-spin" />
        Memuat konfirmasi...
      </div>
    );
  }

  const dateTime = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: booking.timezone,
  }).format(new Date(booking.scheduledAt));
  const cancelled = booking.status === "CANCELLED";

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#e8eeeb] bg-white shadow-[0_18px_60px_rgba(28,60,47,.08)]">
      <div className={`px-6 py-7 text-center text-white ${cancelled ? "bg-[#8b6666]" : "bg-brand-700"}`}>
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/15">
          {cancelled ? <Clock3 className="size-6" /> : <CalendarCheck className="size-6" />}
        </div>
        <p className="mt-4 text-xs text-white/70">Status booking</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {labels[booking.status] ?? booking.status}
        </h1>
        <p className="mt-2 text-[11px] text-white/65">#{booking.id.slice(-8).toUpperCase()}</p>
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        <DetailRow icon={CalendarCheck} label="Waktu kunjungan" value={dateTime} />
        <DetailRow icon={TicketCheck} label="Layanan" value={booking.service} />
        <DetailRow icon={MapPin} label="Cabang" value={booking.branch} />
        {booking.queue && (
          <div className="rounded-xl border border-[#dcebe2] bg-[#f5faf7] p-4">
            <p className="text-[10px] font-medium uppercase tracking-[.1em] text-[#779181]">
              Nomor antrean check-in
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-700">
              {booking.queue.ticketNumber}
            </p>
            <p className="mt-1 text-xs text-[#7b9285]">
              {booking.queue.status === "WAITING" ? "Menunggu dipanggil" : booking.queue.status}
            </p>
          </div>
        )}
        {booking.status === "PENDING" && (
          <div className="flex gap-2 rounded-xl bg-[#fff8eb] p-3 text-[11px] leading-5 text-[#8d713f]">
            <Clock3 className="mt-0.5 size-4 shrink-0" />
            Cabang akan mengonfirmasi booking Anda. Simpan tautan ini untuk memeriksa status.
          </div>
        )}
        {booking.status === "CONFIRMED" && (
          <div className="flex gap-2 rounded-xl bg-[#eef6f1] p-3 text-[11px] leading-5 text-[#557563]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            Booking terkonfirmasi. Datang sesuai jadwal dan tunjukkan halaman ini kepada petugas.
          </div>
        )}
        {error && (
          <InlineNotice
            message="Pembaruan status tertunda. Kami akan mencoba kembali otomatis."
            variant="warning"
          />
        )}
      </div>
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#eff2f0] p-3.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[#57836d]">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-[#9aa5a1]">{label}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[#43514b]">{value}</p>
      </div>
    </div>
  );
}
