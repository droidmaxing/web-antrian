"use client";

import { LoaderCircle, MoveRight, TicketCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { FieldError, InlineNotice } from "@/components/inline-notice";

type ServiceOption = {
  id: string;
  name: string;
  code: string;
  averageMinutes: number;
  estimateMinutes: number;
};

export function PublicQueueForm({
  token,
  services,
  intake,
  nikRequired,
}: {
  token: string;
  services: ServiceOption[];
  intake: { open: boolean; reason: string };
  nikRequired: boolean;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(services);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nik, setNik] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Status buka/tutup ikut polling supaya kiosk tidak perlu di-reload manual.
  const [gate, setGate] = useState(intake);
  // Administrator bisa menyalakan/mematikan validasi NIK kapan saja.
  const [needNik, setNeedNik] = useState(nikRequired);
  const selectedService = options.find((service) => service.id === serviceId);

  // Estimasi bergerak seiring antrean berjalan, jadi segarkan tiap menit tanpa
  // perlu reload halaman.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/public/qr/${token}`, { cache: "no-store" });
        const result = await response.json();
        if (response.ok && Array.isArray(result.data?.services)) {
          setOptions(result.data.services);
        }
        if (response.ok && result.data?.intake) {
          setGate({
            open: Boolean(result.data.intake.open),
            reason: String(result.data.intake.reason ?? ""),
          });
        }
        if (response.ok && typeof result.data?.nikRequired === "boolean") {
          setNeedNik(result.data.nikRequired);
        }
      } catch {
        // Biarkan estimasi terakhir tampil; percobaan berikutnya menyusul.
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [token]);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});
    try {
      const response = await fetch(`/api/v1/public/qr/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          customerName: name,
          ...(phone ? { customerPhone: phone } : {}),
          ...(nik ? { customerNik: nik } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFieldErrors(result.error?.fields ?? {});
        throw new Error(result.error?.message ?? "Nomor antrean gagal dibuat.");
      }
      // Token QR dibawa ke halaman status supaya tombol "Kembali" di sana bisa
      // membuka lagi form ambil nomor (dipakai untuk perangkat bersama/kiosk).
      router.push(`${result.data.statusUrl}?kembali=${encodeURIComponent(token)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Terjadi kesalahan. Coba lagi.",
      );
      setLoading(false);
    }
  }

  if (!services.length) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-bubble-sm">
        <TicketCheck className="mx-auto size-8 text-[#65716d]" />
        <p className="mt-3 text-sm font-semibold text-[#344440]">
          Belum ada layanan tersedia
        </p>
        <p className="mt-1 text-xs text-[#616a67]">
          Silakan hubungi petugas di lokasi.
        </p>
      </div>
    );
  }

  if (!gate.open) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-bubble-sm">
        <TicketCheck className="mx-auto size-8 text-[#65716d]" />
        <p className="mt-3 text-sm font-semibold text-[#344440]">
          Ambil nomor sedang ditutup
        </p>
        <p className="mt-1 text-xs text-[#616a67]">{gate.reason}</p>
        <p className="mt-1 text-xs text-[#616a67]">
          Halaman ini menyegarkan sendiri; form terbuka lagi begitu petugas membuka.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="block">
        <span className="mb-2 block text-xs font-semibold text-[#45544f]">
          Pilih layanan
        </span>
        <SearchableSelect
          value={serviceId}
          onChange={(nextServiceId) => {
            setServiceId(nextServiceId);
            clearFieldError("serviceId");
          }}
          ariaLabel="Pilih layanan"
          invalid={Boolean(fieldErrors.serviceId)}
          describedBy={fieldErrors.serviceId ? "queue-service-error" : undefined}
          options={options.map((service) => ({
            value: service.id,
            label: service.name,
            description: `${service.code} · ±${service.estimateMinutes} menit tunggu`,
          }))}
          className="h-12 w-full rounded-xl bubble-field bg-white px-3.5 text-sm text-[#344440] outline-none"
        />
        <FieldError id="queue-service-error" message={fieldErrors.serviceId} />
      </div>
      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#45544f]">
          Nama Anda
        </span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            clearFieldError("customerName");
          }}
          required
          minLength={2}
          maxLength={120}
          aria-invalid={Boolean(fieldErrors.customerName)}
          aria-describedby={fieldErrors.customerName ? "queue-name-error" : undefined}
          autoComplete="name"
          placeholder="Masukkan nama lengkap"
          className={`h-12 w-full rounded-xl border bg-white px-3.5 text-sm outline-none placeholder:text-[#636a67] focus:border-brand-400 focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.customerName ? "border-[#d98a80]" : "border-brand-200"}`}
        />
        <FieldError id="queue-name-error" message={fieldErrors.customerName} />
      </label>
      <label className="block">
        <span className="mb-2 flex items-center justify-between text-xs font-semibold text-[#45544f]">
          Nomor WhatsApp <span className="font-normal text-[#5d6b67]">Opsional</span>
        </span>
        <input
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            clearFieldError("customerPhone");
          }}
          type="tel"
          maxLength={24}
          aria-invalid={Boolean(fieldErrors.customerPhone)}
          aria-describedby={fieldErrors.customerPhone ? "queue-phone-error" : undefined}
          autoComplete="tel"
          placeholder="+62 812 3456 7890"
          className={`h-12 w-full rounded-xl border bg-white px-3.5 text-sm outline-none placeholder:text-[#636a67] focus:border-brand-400 focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.customerPhone ? "border-[#d98a80]" : "border-brand-200"}`}
        />
        <FieldError id="queue-phone-error" message={fieldErrors.customerPhone} />
      </label>
      {needNik && (
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-[#45544f]">NIK</span>
          <input
            value={nik}
            onChange={(event) => {
              setNik(event.target.value.replace(/\D/g, ""));
              clearFieldError("customerNik");
            }}
            required
            inputMode="numeric"
            pattern="\d{16}"
            maxLength={16}
            aria-invalid={Boolean(fieldErrors.customerNik)}
            aria-describedby={fieldErrors.customerNik ? "queue-nik-error" : undefined}
            placeholder="16 digit sesuai KTP"
            className={`h-12 w-full rounded-xl border bg-white px-3.5 font-mono text-sm tracking-[.06em] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[#636a67] focus:border-brand-400 focus:ring-4 focus:ring-brand-700/[.08] ${fieldErrors.customerNik ? "border-[#d98a80]" : "border-brand-200"}`}
          />
          <FieldError id="queue-nik-error" message={fieldErrors.customerNik} />
        </label>
      )}
      {selectedService && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span className="text-xs text-[#53615b]">Estimasi tunggu saat ini</span>
          <span className="text-xs font-semibold text-brand-700">
            ±{selectedService.estimateMinutes} menit
          </span>
        </div>
      )}
      {error && (
        <InlineNotice message={error} />
      )}
      <button
        type="submit"
        disabled={loading || !serviceId}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Menerbitkan nomor...
          </>
        ) : (
          <>
            Ambil nomor antrean <MoveRight className="size-4" />
          </>
        )}
      </button>
      <p className="text-center text-[11px] leading-4 text-[#5d6b67]">
        Dengan melanjutkan, data Anda digunakan untuk mengelola layanan antrean ini.
      </p>
    </form>
  );
}
