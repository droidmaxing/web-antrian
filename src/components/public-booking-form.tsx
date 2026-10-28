"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FieldError, InlineNotice } from "@/components/inline-notice";
import { SearchableSelect } from "@/components/searchable-select";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  MoveRight,
  UserRound,
} from "lucide-react";

type BookingConfiguration = {
  services: { id: string; name: string; code: string }[];
  today: string;
  lastDate: string;
};

type SlotOption = { time: string; available: boolean };

export function PublicBookingForm({
  token,
  configuration,
}: {
  token: string;
  configuration: BookingConfiguration;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(configuration.services[0]?.id ?? "");
  const [date, setDate] = useState(configuration.today);
  const [availability, setAvailability] = useState<{
    key: string;
    slots: SlotOption[];
    error: string;
  } | null>(null);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [selectedTime, setSelectedTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const availabilityKey = `${serviceId}:${date}`;
  const currentAvailability =
    availability?.key === availabilityKey ? availability : null;
  const slots = currentAvailability?.slots ?? [];
  const loadingSlots = Boolean(serviceId && date && !currentAvailability);
  const error = submitError || currentAvailability?.error || "";

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  useEffect(() => {
    if (!serviceId || !date) return;
    const key = `${serviceId}:${date}`;
    const controller = new AbortController();
    void (async () => {
      try {
        const query = new URLSearchParams({ serviceId, date });
        const response = await fetch(
          `/api/v1/public/bookings/${token}?${query.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message ?? "Jadwal tidak tersedia.");
        }
        setAvailability({ key, slots: result.data.slots, error: "" });
      } catch (slotError) {
        if (!controller.signal.aborted) {
          setAvailability({
            key,
            slots: [],
            error: slotError instanceof Error
              ? slotError.message
              : "Jadwal gagal dimuat.",
          });
        }
      }
    })();
    return () => controller.abort();
  }, [availabilityAttempt, date, serviceId, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTime) {
      setSubmitError("Pilih salah satu waktu yang tersedia.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setFieldErrors({});
    try {
      const response = await fetch(`/api/v1/public/bookings/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          date,
          time: selectedTime,
          customerName: form.name,
          customerPhone: form.phone,
          ...(form.email ? { customerEmail: form.email } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFieldErrors(result.error?.fields ?? {});
        throw new Error(result.error?.message ?? "Booking gagal dibuat.");
      }
      router.push(result.data.statusUrl);
    } catch (submitError) {
      setSubmitError(
        submitError instanceof Error
          ? submitError.message
          : "Booking gagal dibuat. Silakan coba lagi.",
      );
      setSubmitting(false);
    }
  }

  if (!configuration.services.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e1e8e4] bg-[#fbfdfc] p-6 text-center">
        <CalendarDays className="mx-auto size-8 text-[#91a29b]" />
        <p className="mt-3 text-sm font-semibold text-[#344440]">
          Belum ada layanan booking
        </p>
        <p className="mt-1 text-xs text-[#899591]">
          Silakan hubungi cabang untuk informasi jadwal.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#45544f]">
          Layanan
        </span>
        <SearchableSelect
          value={serviceId}
          onChange={(event) => {
            setSelectedTime("");
            setServiceId(event);
            clearFieldError("serviceId");
          }}
          ariaLabel="Layanan"
          invalid={Boolean(fieldErrors.serviceId)}
          describedBy={fieldErrors.serviceId ? "booking-service-error" : undefined}
          options={configuration.services.map((service) => ({
            value: service.id,
            label: service.name,
            description: service.code,
          }))}
          className="h-12 w-full rounded-xl border border-[#e1e8e4] bg-white px-3.5 text-sm text-[#344440] outline-none transition focus:border-[#79b39e] focus:ring-4 focus:ring-brand-700/[.08]"
        />
        <FieldError id="booking-service-error" message={fieldErrors.serviceId} />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#45544f]">
          Tanggal kunjungan
        </span>
        <span className="relative block">
          <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#87958f]" />
          <input
            type="date"
            required
            min={configuration.today}
            max={configuration.lastDate}
            value={date}
            onChange={(event) => {
              setSelectedTime("");
              setDate(event.target.value);
              clearFieldError("date");
            }}
            aria-invalid={Boolean(fieldErrors.date)}
            aria-describedby={fieldErrors.date ? "booking-date-error" : undefined}
            className={`h-12 w-full rounded-xl border bg-white pl-10 pr-3 text-sm text-[#344440] outline-none transition focus:border-[#79b39e] focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.date ? "border-[#d98a80]" : "border-[#e1e8e4]"}`}
          />
        </span>
        <FieldError id="booking-date-error" message={fieldErrors.date} />
      </label>

      <fieldset>
        <div className="mb-2 flex items-center justify-between gap-2">
          <legend className="text-xs font-semibold text-[#45544f]">
            Pilih waktu
          </legend>
          <span className="flex items-center gap-1 text-[10px] text-[#91a09a]">
            <Clock3 className="size-3" /> Durasi slot 30 menit
          </span>
        </div>
        {loadingSlots ? (
          <div className="flex min-h-28 items-center justify-center gap-2 rounded-xl bg-[#f8faf9] text-xs text-[#83918b]">
            <LoaderCircle className="size-4 animate-spin" />
            Memeriksa ketersediaan...
          </div>
        ) : slots.some((slot) => slot.available) ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.time}
                type="button"
                disabled={!slot.available}
                aria-pressed={selectedTime === slot.time}
                aria-describedby={fieldErrors.time ? "booking-time-error" : undefined}
                onClick={() => {
                  setSelectedTime(slot.time);
                  clearFieldError("time");
                }}
                className={`h-10 rounded-lg border text-xs font-semibold transition ${
                  selectedTime === slot.time
                    ? "border-brand-700 bg-brand-700 text-white shadow-sm"
                    : slot.available
                      ? "border-[#e1e8e4] bg-white text-[#4b5a54] hover:border-[#93c0ab] hover:bg-[#f4f9f6]"
                      : "cursor-not-allowed border-[#eff1f0] bg-[#f7f8f8] text-[#c0c8c4] line-through"
                }`}
              >
                {slot.time}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#e1e8e4] bg-[#fbfdfc] px-4 py-7 text-center">
            <Clock3 className="mx-auto size-5 text-[#9ba8a2]" />
            <p className="mt-2 text-xs font-semibold text-[#596761]">
              Tidak ada waktu tersedia
            </p>
            <p className="mt-1 text-[10px] text-[#98a39f]">
              Pilih tanggal lain atau hubungi cabang.
            </p>
          </div>
        )}
        <FieldError id="booking-time-error" message={fieldErrors.time} />
      </fieldset>

      <div className="border-t border-[#eff2f0] pt-5">
        <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-[#45544f]">
          <UserRound className="size-4 text-[#6c9581]" />
          Data pelanggan
        </p>
        <div className="space-y-3">
          <div>
            <input
              value={form.name}
              onChange={(event) => {
                setForm((current) => ({ ...current, name: event.target.value }));
                clearFieldError("customerName");
              }}
              required
              minLength={2}
              maxLength={120}
              aria-invalid={Boolean(fieldErrors.customerName)}
              aria-describedby={fieldErrors.customerName ? "booking-name-error" : undefined}
              autoComplete="name"
              placeholder="Nama lengkap"
              aria-label="Nama lengkap"
              className={`h-12 w-full rounded-xl border bg-white px-3.5 text-sm outline-none placeholder:text-[#a3ada9] focus:border-[#79b39e] focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.customerName ? "border-[#d98a80]" : "border-[#e1e8e4]"}`}
            />
            <FieldError id="booking-name-error" message={fieldErrors.customerName} />
          </div>
          <div>
            <input
              value={form.phone}
              onChange={(event) => {
                setForm((current) => ({ ...current, phone: event.target.value }));
                clearFieldError("customerPhone");
              }}
              type="tel"
              required
              minLength={8}
              maxLength={24}
              aria-invalid={Boolean(fieldErrors.customerPhone)}
              aria-describedby={fieldErrors.customerPhone ? "booking-phone-error" : undefined}
              autoComplete="tel"
              placeholder="Nomor telepon"
              aria-label="Nomor telepon"
              className={`h-12 w-full rounded-xl border bg-white px-3.5 text-sm outline-none placeholder:text-[#a3ada9] focus:border-[#79b39e] focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.customerPhone ? "border-[#d98a80]" : "border-[#e1e8e4]"}`}
            />
            <FieldError id="booking-phone-error" message={fieldErrors.customerPhone} />
          </div>
          <div>
            <input
              value={form.email}
              onChange={(event) => {
                setForm((current) => ({ ...current, email: event.target.value }));
                clearFieldError("customerEmail");
              }}
              type="email"
              maxLength={254}
              aria-invalid={Boolean(fieldErrors.customerEmail)}
              aria-describedby={fieldErrors.customerEmail ? "booking-email-error" : undefined}
              autoComplete="email"
              placeholder="Email (opsional)"
              aria-label="Email (opsional)"
              className={`h-12 w-full rounded-xl border bg-white px-3.5 text-sm outline-none placeholder:text-[#a3ada9] focus:border-[#79b39e] focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.customerEmail ? "border-[#d98a80]" : "border-[#e1e8e4]"}`}
            />
            <FieldError id="booking-email-error" message={fieldErrors.customerEmail} />
          </div>
        </div>
      </div>

      {error && (
        <div className="space-y-2">
          <InlineNotice message={error} />
          {currentAvailability?.error && (
            <button
              type="button"
              onClick={() => {
                setAvailability(null);
                setAvailabilityAttempt((attempt) => attempt + 1);
              }}
              className="text-xs font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              Coba muat jadwal lagi
            </button>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || loadingSlots || !selectedTime}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 text-sm font-semibold text-white shadow-[0_5px_12px_rgba(23,107,91,.12)] transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" /> Membuat booking...
          </>
        ) : (
          <>
            Konfirmasi booking <MoveRight className="size-4" />
          </>
        )}
      </button>
      <p className="text-center text-[10px] leading-4 text-[#9aa5a1]">
        Satu pelanggan per slot 30 menit. Status booking dapat diperiksa melalui
        tautan konfirmasi.
      </p>
    </form>
  );
}
