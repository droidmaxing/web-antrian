"use client";

import { useEffect, useRef, useState } from "react";
import { CirclePlus, LoaderCircle, Pencil, Search, Trash2, X } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { readApiError } from "@/lib/api-error";

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  queueCount: number;
  bookingCount: number;
  lastVisitAt: string | null;
  lastServiceName: string | null;
};

type Draft = {
  id: string | null;
  name: string;
  phone: string;
  email: string;
};

const emptyDraft: Draft = { id: null, name: "", phone: "", email: "" };

/** Pertumbuhan daftar pelanggan bisa cepat, jadi kartu ditampilkan bertahap. */
const PAGE_SIZE = 20;

const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTime.format(parsed);
}

export function CustomersManager({
  businessSlug,
  canManage,
  initialQuery = "",
}: {
  businessSlug: string;
  canManage: boolean;
  initialQuery?: string;
}) {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestRef = useRef(0);

  async function load(search: string) {
    const ticket = ++requestRef.current;
    try {
      const url = new URL(
        `/api/v1/businesses/${businessSlug}/customers`,
        window.location.origin,
      );
      if (search.trim()) url.searchParams.set("query", search.trim());
      const response = await fetch(url.toString(), { cache: "no-store" });
      const result = await response.json();
      if (ticket !== requestRef.current) return;
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat pelanggan.");
      setCustomers(result.data);
    } catch (error) {
      if (ticket !== requestRef.current) return;
      setCustomers([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat pelanggan.");
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessSlug, query]);

  async function submit() {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      setNoticeVariant("error");
      setNotice("Nama pelanggan minimal 2 karakter.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        draft.id
          ? `/api/v1/businesses/${businessSlug}/customers/${draft.id}`
          : `/api/v1/businesses/${businessSlug}/customers`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            phone: draft.phone.trim() || null,
            email: draft.email.trim() || null,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        const detail = await readApiError(
          new Response(JSON.stringify(result), { status: response.status }),
        );
        setFieldErrors(detail.fields ?? {});
        throw new Error(detail.message);
      }
      setFieldErrors({});
      setNoticeVariant("success");
      setNotice(draft.id ? "Data pelanggan diperbarui." : "Pelanggan baru ditambahkan.");
      setDraft(null);
      await load(query);
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan pelanggan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(customer: CustomerRow) {
    if (typeof window !== "undefined" && !window.confirm(`Hapus pelanggan "${customer.name}"?`)) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/customers/${customer.id}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error?.message ?? "Gagal menghapus pelanggan.");
      }
      setNoticeVariant("success");
      setNotice(`Pelanggan ${customer.name} dihapus.`);
      await load(query);
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menghapus pelanggan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="customers-manage"
      className="scroll-mt-28 rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Pelanggan</h2>
          <p className="mt-1 text-xs text-[#929e99]">
            Database pelanggan workspace ini{" "}
            {customers ? `· ${customers.length} kontak` : ""}.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setDraft({ ...emptyDraft })}
            className="flex h-9 items-center gap-2 rounded-lg bg-[#176b5b] px-3 text-xs font-semibold text-white hover:bg-[#125648]"
          >
            <CirclePlus className="size-4" /> Tambah pelanggan
          </button>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      <div className="mt-4 flex h-9 items-center gap-2 rounded-lg border border-[#edf0ef] bg-[#fafbfa] px-3">
        <Search className="size-4 text-[#a1aca8]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama, nomor telepon, atau email..."
          className="h-full w-full bg-transparent text-xs text-[#344440] outline-none placeholder:text-[#a9b3af]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Bersihkan pencarian"
            className="rounded p-1 text-[#a1aca8] hover:bg-[#eef1ef]"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 grid gap-3 rounded-xl border border-[#e3ece7] bg-[#fafcfb] p-4 sm:grid-cols-2"
        >
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Nama
            <input
              required
              minLength={2}
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Budi Santoso"
              aria-invalid={Boolean(fieldErrors.name)}
              className={`mt-1.5 h-9 w-full rounded-lg border bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4] ${
                fieldErrors.name ? "border-[#e0a99f]" : "border-[#e0e6e3]"
              }`}
            />
            {fieldErrors.name && (
              <span className="mt-1 block text-[10px] font-normal text-[#b4553f]">
                {fieldErrors.name}
              </span>
            )}
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Nomor telepon (opsional)
            <input
              maxLength={20}
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              placeholder="08123456789"
              aria-invalid={Boolean(fieldErrors.phone)}
              className={`mt-1.5 h-9 w-full rounded-lg border bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4] ${
                fieldErrors.phone ? "border-[#e0a99f]" : "border-[#e0e6e3]"
              }`}
            />
            {fieldErrors.phone && (
              <span className="mt-1 block text-[10px] font-normal text-[#b4553f]">
                {fieldErrors.phone}
              </span>
            )}
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65] sm:col-span-2">
            Email (opsional)
            <input
              type="email"
              maxLength={120}
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              placeholder="nama@contoh.com"
              aria-invalid={Boolean(fieldErrors.email)}
              className={`mt-1.5 h-9 w-full rounded-lg border bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4] ${
                fieldErrors.email ? "border-[#e0a99f]" : "border-[#e0e6e3]"
              }`}
            />
            {fieldErrors.email && (
              <span className="mt-1 block text-[10px] font-normal text-[#b4553f]">
                {fieldErrors.email}
              </span>
            )}
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-lg bg-[#176b5b] px-3.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Simpan
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-9 rounded-lg border border-[#e0e6e3] px-3.5 text-xs font-medium text-[#687570]"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {customers === null && (
          <p className="py-6 text-center text-xs text-[#a1aca8]">Memuat pelanggan…</p>
        )}
        {customers?.slice(0, visibleCount).map((customer) => (
          <div
            key={customer.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eff2f0] p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#edf5f1] text-[11px] font-bold text-[#377861]">
              {customer.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#344440]">{customer.name}</p>
              <p className="mt-1 truncate text-[10px] text-[#929e99]">
                {customer.phone ?? "Tanpa nomor"} · {customer.email ?? "Tanpa email"} ·{" "}
                {customer.queueCount} antrean
                {customer.bookingCount ? ` · ${customer.bookingCount} booking` : ""}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-[#b0bab6]">
                Terakhir datang {formatDateTime(customer.lastVisitAt)}
                {customer.lastServiceName ? ` · ${customer.lastServiceName}` : ""}
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setDraft({
                      id: customer.id,
                      name: customer.name,
                      phone: customer.phone ?? "",
                      email: customer.email ?? "",
                    })
                  }
                  aria-label={`Ubah ${customer.name}`}
                  className="rounded-lg p-2 text-[#889590] hover:bg-[#f4f7f5]"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => void remove(customer)}
                  disabled={busy}
                  aria-label={`Hapus ${customer.name}`}
                  className="rounded-lg p-2 text-[#a8736b] hover:bg-[#fbf2f0] disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {customers?.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#e2e9e5] px-4 py-6 text-center text-xs text-[#98a39f]">
            {query
              ? "Tidak ada pelanggan yang cocok dengan pencarian."
              : "Belum ada pelanggan. Tambahkan kontak pertama untuk workspace ini."}
          </p>
        )}
        {customers && customers.length > visibleCount && (
          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="h-9 rounded-lg border border-[#e0e6e3] px-4 text-[11px] font-semibold text-[#41524c] hover:bg-[#f6f9f7]"
            >
              Muat {Math.min(PAGE_SIZE, customers.length - visibleCount)} pelanggan lagi
            </button>
          </div>
        )}
        {customers && customers.length > 0 && (
          <p className="pt-2 text-center text-[10px] text-[#a1aca8]">
            Menampilkan {Math.min(visibleCount, customers.length)} dari {customers.length} kontak
            {query.trim() ? ` (hasil pencarian “${query.trim()}”)` : ""}.
          </p>
        )}
      </div>
    </section>
  );
}
