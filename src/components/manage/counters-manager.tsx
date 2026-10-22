"use client";

import { useEffect, useState } from "react";
import { ChevronDown, CirclePlus, LoaderCircle, Power, Search, Trash2, X } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type CounterRow = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  serviceIds: string[];
  activeQueue: { ticketNumber: string; status: string } | null;
  ticketCount: number;
};

type ServiceOption = { id: string; name: string; code: string };

type Draft = {
  id: string | null;
  name: string;
  code: string;
  serviceIds: string[];
};

export function CountersManager({
  businessSlug,
  branchId,
  branchName,
  canConfigure,
  services,
}: {
  businessSlug: string;
  branchId: string;
  branchName: string;
  canConfigure: boolean;
  services: ServiceOption[];
}) {
  const [counters, setCounters] = useState<CounterRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");

  async function load() {
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/counters?branchId=${encodeURIComponent(branchId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat loket.");
      setCounters(result.data);
    } catch (error) {
      setCounters([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat loket.");
    }
  }

  useEffect(() => {
    let stopped = false;
    void (async () => {
      await Promise.resolve();
      if (!stopped) await load();
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessSlug, branchId]);

  async function submit() {
    if (!draft) return;
    if (!draft.serviceIds.length) {
      setNoticeVariant("error");
      setNotice("Pilih minimal satu layanan untuk loket ini.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        draft.id
          ? `/api/v1/businesses/${businessSlug}/counters/${draft.id}`
          : `/api/v1/businesses/${businessSlug}/counters`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            draft.id
              ? {
                  name: draft.name.trim(),
                  code: draft.code.trim().toUpperCase(),
                  serviceIds: draft.serviceIds,
                }
              : {
                  branchId,
                  name: draft.name.trim(),
                  code: draft.code.trim().toUpperCase(),
                  serviceIds: draft.serviceIds,
                },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan loket.");
      setNoticeVariant("success");
      setNotice(draft.id ? "Loket diperbarui." : "Loket baru ditambahkan.");
      setDraft(null);
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan loket.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(counter: CounterRow) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/counters/${counter.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !counter.active }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengubah status loket.");
      setNoticeVariant("success");
      setNotice(`Loket ${counter.name} ${counter.active ? "dinonaktifkan" : "diaktifkan"}.`);
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengubah status loket.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(counter: CounterRow) {
    const confirmed = window.confirm(
      `Hapus loket "${counter.name}"? Loket yang sudah pernah melayani antrean hanya akan dinonaktifkan agar riwayat tetap utuh.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/counters/${counter.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menghapus loket.");
      setNoticeVariant("success");
      setNotice(
        result.data?.archived
          ? `Loket ${counter.name} dinonaktifkan karena memiliki riwayat antrean.`
          : `Loket ${counter.name} dihapus.`,
      );
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menghapus loket.");
    } finally {
      setBusy(false);
    }
  }

  const serviceName = (id: string) =>
    services.find((service) => service.id === id)?.name ?? id;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCounters = (counters ?? []).filter((counter) => {
    if (!normalizedQuery) return true;
    const haystack = [
      counter.name,
      counter.code,
      ...counter.serviceIds.map(serviceName),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const pagedCounters = visibleCounters.slice(0, visibleCount);

  return (
    <section
      id="counters-manage"
      className="scroll-mt-28 rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Loket cabang</h2>
          <p className="mt-1 text-xs text-[#929e99]">
            Loket aktif di {branchName} beserta layanan yang dilayani.
          </p>
        </div>
        {canConfigure && !draft && (
          <button
            onClick={() =>
              setDraft({
                id: null,
                name: "",
                code: "",
                serviceIds: services.slice(0, 1).map((service) => service.id),
              })
            }
            disabled={!services.length}
            className="flex h-9 items-center gap-2 rounded-lg bg-[#176b5b] px-3 text-xs font-semibold text-white hover:bg-[#125648] disabled:opacity-40"
          >
            <CirclePlus className="size-4" /> Tambah loket
          </button>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      {counters && counters.length > 3 && (
        <div className="mt-4 flex h-9 items-center gap-2 rounded-lg border border-[#edf0ef] bg-[#fafbfa] px-3">
          <Search className="size-4 text-[#a1aca8]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari loket atau layanan..."
            aria-label="Cari loket"
            className="h-full w-full bg-transparent text-xs text-[#344440] outline-none placeholder:text-[#a9b3af]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Bersihkan pencarian loket"
              className="rounded p-1 text-[#a1aca8] hover:bg-[#eef1ef]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 grid gap-3 rounded-xl border border-[#e3ece7] bg-[#fafcfb] p-4 sm:grid-cols-2"
        >
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Nama loket
            <input
              required
              minLength={2}
              maxLength={60}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Loket 1"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4]"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Kode
            <input
              required
              maxLength={6}
              pattern="[A-Za-z0-9]+"
              value={draft.code}
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value.toUpperCase() })
              }
              placeholder="L1"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-3 font-mono text-xs uppercase text-[#344440] outline-none focus:border-[#78b6a4]"
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-[11px] font-medium text-[#5d6b65]">Layanan</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {services.map((service) => {
                const selected = draft.serviceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        serviceIds: selected
                          ? draft.serviceIds.filter((id) => id !== service.id)
                          : [...draft.serviceIds, service.id],
                      })
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition ${
                      selected
                        ? "border-[#176b5b] bg-[#eaf4ef] text-[#176b5b]"
                        : "border-[#e0e6e3] bg-white text-[#687570]"
                    }`}
                  >
                    {service.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
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
        {counters === null && (
          <p className="py-6 text-center text-xs text-[#a1aca8]">Memuat loket…</p>
        )}
        {pagedCounters.map((counter) => (
          <div
            key={counter.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eff2f0] p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#edf5f1] font-mono text-[10px] font-bold text-[#377861]">
              {counter.code}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-[#344440]">{counter.name}</p>
                {!counter.active && (
                  <span className="rounded-full bg-[#f3f4f4] px-2 py-0.5 text-[9px] font-medium text-[#8b948f]">
                    Nonaktif
                  </span>
                )}
                {counter.activeQueue && (
                  <span className="rounded-full bg-[#eaf4ef] px-2 py-0.5 text-[9px] font-medium text-[#277660]">
                    {counter.activeQueue.ticketNumber}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[10px] text-[#929e99]">
                {counter.serviceIds.map(serviceName).join(", ") || "Belum ada layanan"} ·{" "}
                {counter.ticketCount} antrean dilayani
              </p>
            </div>
            {canConfigure && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setDraft({
                      id: counter.id,
                      name: counter.name,
                      code: counter.code,
                      serviceIds: counter.serviceIds,
                    })
                  }
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-[#687570] hover:bg-[#f4f7f5]"
                >
                  Ubah
                </button>
                <button
                  onClick={() => void toggle(counter)}
                  disabled={busy}
                  aria-label={counter.active ? "Nonaktifkan loket" : "Aktifkan loket"}
                  className="rounded-lg p-2 text-[#889590] hover:bg-[#f4f7f5] disabled:opacity-40"
                >
                  <Power className="size-3.5" />
                </button>
                <button
                  onClick={() => void remove(counter)}
                  disabled={busy || Boolean(counter.activeQueue)}
                  aria-label={`Hapus loket ${counter.name}`}
                  title={
                    counter.activeQueue
                      ? "Loket masih melayani antrean"
                      : "Hapus atau nonaktifkan loket"
                  }
                  className="rounded-lg p-2 text-[#b0a29c] hover:bg-[#fdf2f0] hover:text-[#b4543c] disabled:opacity-30"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {counters?.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#e2e9e5] px-4 py-6 text-center text-xs text-[#98a39f]">
            Belum ada loket di cabang ini.
          </p>
        )}
        {counters && counters.length > 0 && visibleCounters.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#e2e9e5] px-4 py-6 text-center text-xs text-[#98a39f]">
            Tidak ada loket yang cocok dengan “{query.trim()}”.
          </p>
        )}
        {counters && counters.length > 0 && (
          <p className="mt-4 text-center text-[10px] text-[#a1aca8]">
            Menampilkan {pagedCounters.length} dari {visibleCounters.length} loket
            {visibleCounters.length !== counters.length
              ? ` (total ${counters.length} di cabang ini)`
              : ""}
            .
          </p>
        )}
        {visibleCounters.length > visibleCount && (
          <button
            onClick={() => setVisibleCount((value) => value + 12)}
            className="mx-auto mt-3 flex h-9 items-center gap-2 rounded-lg border border-[#e2e9e5] px-3 text-xs font-semibold text-[#4d5c57] hover:bg-[#f4f7f5]"
          >
            <ChevronDown className="size-4" />
            Muat {Math.min(12, visibleCounters.length - visibleCount)} loket lagi
          </button>
        )}
      </div>
    </section>
  );
}
