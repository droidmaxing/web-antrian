"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InlineNotice } from "@/components/inline-notice";
import { Pager, usePaged } from "@/components/pagination";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  Phone,
  TicketCheck,
  UserRound,
} from "lucide-react";

export type BookingRow = {
  id: string;
  scheduledAt: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  service: { name: string };
  customer: { name: string; phone: string | null };
  queue: { id: string; ticketNumber: string; status: string } | null;
};

const labels: Record<BookingRow["status"], string> = {
  PENDING: "Perlu konfirmasi",
  CONFIRMED: "Dikonfirmasi",
  CHECKED_IN: "Check-in",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  NO_SHOW: "Tidak hadir",
};

export function BookingManagement({
  businessSlug,
  branchId,
  today,
  timezone,
  bookings,
  readOnly,
}: {
  businessSlug: string;
  branchId: string;
  /** Tanggal hari ini di zona cabang; awal daftar dan tombol "Hari ini". */
  today: string;
  timezone: string;
  bookings: BookingRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  // Booking biasanya dibuat untuk hari-hari berikutnya, jadi daftar bisa
  // dipindah tanggal tanpa menunggu konfirmasi muncul esok hari.
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState(bookings);
  const [loadingDate, setLoadingDate] = useState(false);
  const paged = usePaged(rows);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");

  async function loadDate(next: string) {
    setLoadingDate(true);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/bookings?branchId=${branchId}&date=${next}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat booking.");
      setRows(result.data);
    } catch (error) {
      setRows([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat booking.");
    } finally {
      setLoadingDate(false);
    }
  }

  function selectDate(next: string) {
    if (!next) return;
    setDate(next);
    setNotice("");
    void loadDate(next);
  }

  async function runAction(bookingId: string, action: "confirm" | "cancel" | "check-in" | "no-show") {
    setPending(`${bookingId}:${action}`);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/bookings/${bookingId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message ?? "Aksi booking gagal.");
      }
      setNotice(
        action === "check-in" && result.data.queueTicket
          ? `Check-in berhasil. Nomor antrean ${result.data.queueTicket}.`
          : "Status booking berhasil diperbarui.",
      );
      setNoticeVariant("success");
      router.refresh();
      // Status berubah: muat ulang tanggal yang sedang dilihat supaya tidak
      // menampilkan status lama.
      await loadDate(date);
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      id="bookings"
      className="overflow-hidden bubble-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 px-5 py-5 md:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-[-.02em]">
              {date === today ? "Booking hari ini" : "Booking"}
            </h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
              {rows.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#66736e]">
            Konfirmasi reservasi dan check-in pelanggan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1.5 text-[11px] text-[#65706b]">
            <CalendarClock className="size-3.5" />
            <input
              type="date"
              value={date}
              onChange={(event) => selectDate(event.target.value)}
              aria-label="Tanggal booking"
              className="bg-transparent text-[11px] text-[#5d6b65] outline-none"
            />
          </label>
          {date !== today && (
            <button
              type="button"
              onClick={() => selectDate(today)}
              className="h-7 rounded-full bubble-btn px-2.5 text-[11px] font-medium text-brand-700"
            >
              Hari ini
            </button>
          )}
        </div>
      </div>

      {notice && (
        <InlineNotice message={notice} variant={noticeVariant} className="mx-5 mt-4 md:mx-6" />
      )}

      {loadingDate ? (
        <p className="flex items-center justify-center gap-2 px-5 py-7 text-xs text-[#5d6b67] md:px-6">
          <LoaderCircle className="size-3.5 animate-spin" /> Memuat booking...
        </p>
      ) : rows.length ? (
        <div className="divide-y divide-brand-100">
          {paged.rows?.map((booking) => (
            <article
              key={booking.id}
              className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-6"
            >
              <div className="flex min-w-0 gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff5e7] text-[#91662b]">
                  <Clock3 className="size-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#344440]">
                      {new Intl.DateTimeFormat("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: timezone,
                      }).format(new Date(booking.scheduledAt))}
                    </p>
                    <StatusBadge status={booking.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-[#65716d]">
                    {booking.service.name}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#66736e]">
                    <span className="flex items-center gap-1">
                      <UserRound className="size-3" /> {booking.customer.name}
                    </span>
                    {booking.customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {booking.customer.phone}
                      </span>
                    )}
                    {booking.queue && (
                      <span className="flex items-center gap-1 font-semibold text-brand-600">
                        <TicketCheck className="size-3" /> {booking.queue.ticketNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2 pl-[52px] sm:justify-end sm:pl-0">
                  {booking.status === "PENDING" && (
                    <>
                      <ActionButton
                        label="Konfirmasi"
                        loading={pending === `${booking.id}:confirm`}
                        onClick={() => void runAction(booking.id, "confirm")}
                        primary
                      />
                      <ActionButton
                        label="Batalkan"
                        loading={pending === `${booking.id}:cancel`}
                        onClick={() => void runAction(booking.id, "cancel")}
                      />
                    </>
                  )}
                  {booking.status === "CONFIRMED" && (
                    <>
                      <ActionButton
                        label="Check-in"
                        loading={pending === `${booking.id}:check-in`}
                        onClick={() => void runAction(booking.id, "check-in")}
                        primary
                      />
                      <ActionButton
                        label="Batalkan"
                        loading={pending === `${booking.id}:cancel`}
                        onClick={() => void runAction(booking.id, "cancel")}
                      />
                      <ActionButton
                        label="Tidak hadir"
                        loading={pending === `${booking.id}:no-show`}
                        onClick={() => void runAction(booking.id, "no-show")}
                      />
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="px-5 py-7 md:px-6">
          <div className="rounded-xl bg-brand-50 px-4 py-8 text-center bubble-panel">
            <CalendarCheckIcon />
            <p className="mt-3 text-xs font-semibold text-[#46544f]">
              Belum ada booking pada tanggal ini
            </p>
            <p className="mt-1 text-[11px] text-[#5d6b67]">
              Reservasi pelanggan akan tampil di sini.
            </p>
          </div>
        </div>
      )}
      <div className="px-5 md:px-6">
        <Pager
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          unit="booking"
          onPage={paged.setPage}
          onPageSize={paged.setPageSize}
        />
      </div>
      <div className="flex items-center justify-between border-t border-brand-100 px-5 py-3.5 text-[11px] text-[#66736e] md:px-6">
        <span>{readOnly ? "Tampilan baca saja" : "Perubahan tercatat dalam audit log"}</span>
        <MapPin className="size-3.5" />
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: BookingRow["status"] }) {
  const styles: Record<BookingRow["status"], string> = {
    PENDING: "bg-[#fff6e8] text-[#94651e]",
    CONFIRMED: "bg-[#edf2fc] text-[#4a679e]",
    CHECKED_IN: "bg-brand-100 text-brand-700",
    COMPLETED: "bg-brand-50 text-[#637069]",
    CANCELLED: "bg-[#fbefef] text-[#a5463d]",
    NO_SHOW: "bg-[#f4effb] text-[#6d5695]",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
  primary = false,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition disabled:opacity-50 ${
        primary
          ? "bg-brand-700 text-white hover:bg-brand-800"
          : "bubble-btn text-[#65716d] hover:bg-brand-50"
      }`}
    >
      {loading ? (
        <LoaderCircle className="size-3 animate-spin" />
      ) : primary ? (
        <Check className="size-3" />
      ) : (
        <CheckCircle2 className="size-3" />
      )}
      {label}
    </button>
  );
}

function CalendarCheckIcon() {
  return (
    <div className="mx-auto flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
      <CalendarClock className="size-4" />
    </div>
  );
}
