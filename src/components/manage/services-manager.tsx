"use client";

import { useEffect, useState } from "react";
import { CirclePlus, LoaderCircle, Pencil, Power, Trash2 } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type ServiceRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  averageMinutes: number;
  active: boolean;
  queueCount: number;
  counterCount: number;
  bookingCount: number;
};

type Draft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  averageMinutes: number;
};

const emptyDraft: Draft = {
  id: null,
  name: "",
  code: "",
  description: "",
  averageMinutes: 10,
};

export function ServicesManager({
  businessSlug,
  canConfigure,
}: {
  businessSlug: string;
  canConfigure: boolean;
}) {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");

  async function load() {
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/services`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat layanan.");
      setServices(result.data);
    } catch (error) {
      setServices([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat layanan.");
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
  }, [businessSlug]);

  async function submit() {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    try {
      const payload = {
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase(),
        description: draft.description.trim() || null,
        averageMinutes: draft.averageMinutes,
      };
      const response = await fetch(
        draft.id
          ? `/api/v1/businesses/${businessSlug}/services/${draft.id}`
          : `/api/v1/businesses/${businessSlug}/services`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan layanan.");
      setNoticeVariant("success");
      setNotice(draft.id ? "Layanan diperbarui." : `Layanan ${payload.name} ditambahkan.`);
      setDraft(null);
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan layanan.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(service: ServiceRow) {
    if (!window.confirm(`Hapus layanan "${service.name}"? Riwayat antrean tetap tersimpan.`)) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/services/${service.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menghapus layanan.");
      setNoticeVariant("success");
      setNotice(
        result.data?.archived
          ? "Layanan diarsipkan karena sudah punya riwayat antrean."
          : "Layanan dihapus.",
      );
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menghapus layanan.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(service: ServiceRow) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/services/${service.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !service.active }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengubah status.");
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="services-manage"
      className="scroll-mt-28 rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Layanan</h2>
          <p className="mt-1 text-xs text-[#929e99]">
            Jenis layanan yang bisa diambil pelanggan.
          </p>
        </div>
        {canConfigure && !draft && (
          <button
            onClick={() => setDraft(emptyDraft)}
            className="flex h-9 items-center gap-2 rounded-lg bg-[#176b5b] px-3 text-xs font-semibold text-white hover:bg-[#125648]"
          >
            <CirclePlus className="size-4" /> Tambah layanan
          </button>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 grid gap-3 rounded-xl border border-[#e3ece7] bg-[#fafcfb] p-4 sm:grid-cols-2"
        >
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Nama layanan
            <input
              required
              minLength={2}
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Contoh: Pembayaran tagihan"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4]"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Kode
            <input
              required
              maxLength={8}
              pattern="[A-Za-z0-9]+"
              value={draft.code}
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value.toUpperCase() })
              }
              placeholder="BYR"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-3 font-mono text-xs uppercase text-[#344440] outline-none focus:border-[#78b6a4]"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65] sm:col-span-2">
            Deskripsi <span className="font-normal text-[#a1aca8]">(opsional)</span>
            <input
              maxLength={500}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className="mt-1.5 h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4]"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Estimasi durasi (menit)
            <input
              required
              type="number"
              min={1}
              max={240}
              value={draft.averageMinutes}
              onChange={(event) =>
                setDraft({ ...draft, averageMinutes: Number(event.target.value) })
              }
              className="mt-1.5 h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-3 text-xs text-[#344440] outline-none focus:border-[#78b6a4]"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
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
        {services === null && (
          <p className="py-6 text-center text-xs text-[#a1aca8]">Memuat layanan…</p>
        )}
        {services?.map((service) => (
          <div
            key={service.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eff2f0] p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#edf5f1] font-mono text-[10px] font-bold text-[#377861]">
              {service.code}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-[#344440]">{service.name}</p>
                {!service.active && (
                  <span className="rounded-full bg-[#f3f4f4] px-2 py-0.5 text-[9px] font-medium text-[#8b948f]">
                    Nonaktif
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[#929e99]">
                {service.averageMinutes} mnt · {service.counterCount} loket ·{" "}
                {service.queueCount} antrean
                {service.description ? ` · ${service.description}` : ""}
              </p>
            </div>
            {canConfigure && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setDraft({
                      id: service.id,
                      name: service.name,
                      code: service.code,
                      description: service.description ?? "",
                      averageMinutes: service.averageMinutes,
                    })
                  }
                  aria-label={`Ubah ${service.name}`}
                  className="rounded-lg p-2 text-[#889590] hover:bg-[#f4f7f5]"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => void toggle(service)}
                  disabled={busy}
                  aria-label={service.active ? `Nonaktifkan ${service.name}` : `Aktifkan ${service.name}`}
                  className="rounded-lg p-2 text-[#889590] hover:bg-[#f4f7f5] disabled:opacity-40"
                >
                  <Power className="size-3.5" />
                </button>
                <button
                  onClick={() => void archive(service)}
                  disabled={busy}
                  aria-label={`Hapus ${service.name}`}
                  className="rounded-lg p-2 text-[#b4756d] hover:bg-[#fdf3f2] disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {services?.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#e2e9e5] px-4 py-6 text-center text-xs text-[#98a39f]">
            Belum ada layanan. Tambahkan layanan pertama untuk mulai menerbitkan antrean.
          </p>
        )}
      </div>
    </section>
  );
}
