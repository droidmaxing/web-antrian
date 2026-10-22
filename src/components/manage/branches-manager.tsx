"use client";

import { useEffect, useState } from "react";
import { Building2, CirclePlus, LoaderCircle, Pencil, Power, X } from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";

type BranchRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  active: boolean;
  counterCount: number;
  queueCount: number;
  ticketPrefix: string;
  resetDaily: boolean;
  estimateBuffer: number;
  operatingHours: { weekday: number; opensAt: string; closesAt: string; closed: boolean }[];
};

type Draft = {
  id: string | null;
  name: string;
  timezone: string;
  ticketPrefix: string;
  estimateBuffer: number;
};

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Pontianak",
  "Asia/Singapore",
];

const emptyDraft: Draft = {
  id: null,
  name: "",
  timezone: "Asia/Jakarta",
  ticketPrefix: "Q",
  estimateBuffer: 0,
};

export function BranchesManager({
  businessSlug,
  canManage,
  currentBranchId,
}: {
  businessSlug: string;
  canManage: boolean;
  currentBranchId: string;
}) {
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");

  async function load() {
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/branches`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat cabang.");
      setBranches(result.data);
    } catch (error) {
      setBranches([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat cabang.");
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
        timezone: draft.timezone,
        ticketPrefix: draft.ticketPrefix.trim().toUpperCase() || "Q",
        estimateBuffer: draft.estimateBuffer,
      };
      const response = await fetch(
        draft.id
          ? `/api/v1/businesses/${businessSlug}/branches?branchId=${encodeURIComponent(draft.id)}`
          : `/api/v1/businesses/${businessSlug}/branches`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan cabang.");
      setNoticeVariant("success");
      setNotice(draft.id ? "Cabang diperbarui." : `Cabang ${payload.name} ditambahkan.`);
      setDraft(null);
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan cabang.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(branch: BranchRow) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/branches?branchId=${encodeURIComponent(branch.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !branch.active }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengubah status cabang.");
      setNoticeVariant("success");
      setNotice(branch.active ? `${branch.name} dinonaktifkan.` : `${branch.name} diaktifkan kembali.`);
      await load();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengubah status cabang.");
    } finally {
      setBusy(false);
    }
  }

  function edit(branch: BranchRow) {
    setNotice("");
    setDraft({
      id: branch.id,
      name: branch.name,
      timezone: branch.timezone,
      ticketPrefix: branch.ticketPrefix,
      estimateBuffer: branch.estimateBuffer,
    });
  }

  const editable = canManage;

  return (
    <section
      id="branches"
      className="scroll-mt-28 rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-.02em]">
            <Building2 className="size-4 text-[#34775f]" /> Cabang
          </h2>
          <p className="mt-1 text-xs text-[#929e99]">
            Setiap cabang punya loket, layanan, dan penomoran antreannya sendiri.
          </p>
        </div>
        {editable && !draft && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setDraft({ ...emptyDraft });
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-[#176b5b] px-3 text-xs font-semibold text-white hover:bg-[#125648]"
          >
            <CirclePlus className="size-3.5" /> Cabang baru
          </button>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      {draft && (
        <form
          className="mt-4 rounded-xl border border-[#e4ece8] bg-[#fbfdfc] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#3d594b]">
              {draft.id ? "Ubah cabang" : "Tambah cabang"}
            </p>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label="Tutup formulir cabang"
              className="rounded-lg p-1.5 text-[#889590] hover:bg-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-medium text-[#75827f]">
              Nama cabang
              <input
                required
                minLength={2}
                maxLength={80}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Cabang Sudirman"
                className="mt-1 block h-9 w-full rounded-lg border border-[#e0e6e3] px-2.5 text-xs text-[#344440]"
              />
            </label>
            <label className="text-[10px] font-medium text-[#75827f]">
              Zona waktu
              <select
                value={draft.timezone}
                onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                className="mt-1 block h-9 w-full rounded-lg border border-[#e0e6e3] bg-white px-2.5 text-xs text-[#344440]"
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-medium text-[#75827f]">
              Prefiks nomor antrean
              <input
                maxLength={4}
                value={draft.ticketPrefix}
                onChange={(event) => setDraft({ ...draft, ticketPrefix: event.target.value })}
                placeholder="Q"
                className="mt-1 block h-9 w-full rounded-lg border border-[#e0e6e3] px-2.5 font-mono text-xs text-[#344440]"
              />
            </label>
            <label className="text-[10px] font-medium text-[#75827f]">
              Penyangga estimasi (menit)
              <input
                type="number"
                min={0}
                max={120}
                value={draft.estimateBuffer}
                onChange={(event) =>
                  setDraft({ ...draft, estimateBuffer: Number(event.target.value) || 0 })
                }
                className="mt-1 block h-9 w-full rounded-lg border border-[#e0e6e3] px-2.5 text-xs text-[#344440]"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-lg bg-[#176b5b] px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              {draft.id ? "Simpan perubahan" : "Tambah cabang"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-9 rounded-lg border border-[#e0e6e3] px-3 text-xs font-medium text-[#687570]"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {branches === null ? (
        <div className="flex items-center gap-2 py-6 text-xs text-[#83918b]">
          <LoaderCircle className="size-4 animate-spin" /> Memuat cabang...
        </div>
      ) : branches.length ? (
        <div className="mt-4 divide-y divide-[#f2f5f3] overflow-hidden rounded-xl border border-[#eff2f0]">
          {branches.map((branch) => (
            <div key={branch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#edf5f1] text-[10px] font-bold text-[#377861]">
                {branch.ticketPrefix}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold text-[#344440]">
                  {branch.name}
                  {branch.id === currentBranchId && (
                    <span className="rounded-full bg-[#edf5f1] px-2 py-0.5 text-[9px] font-medium text-[#377861]">
                      Sedang dibuka
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[10px] text-[#929e99]">
                  {branch.timezone} · {branch.counterCount} loket · {branch.queueCount} antrean
                  {branch.resetDaily ? " · reset harian" : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                  branch.active ? "bg-[#e9f5ef] text-[#31795d]" : "bg-[#f0f3f2] text-[#74817c]"
                }`}
              >
                {branch.active ? "Aktif" : "Nonaktif"}
              </span>
              {editable && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => edit(branch)}
                    disabled={busy}
                    aria-label={`Ubah ${branch.name}`}
                    className="flex size-8 items-center justify-center rounded-lg border border-[#e4e9e6] text-[#687570] hover:bg-[#f7faf8] disabled:opacity-40"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(branch)}
                    disabled={busy}
                    aria-label={branch.active ? `Nonaktifkan ${branch.name}` : `Aktifkan ${branch.name}`}
                    className="flex size-8 items-center justify-center rounded-lg border border-[#e4e9e6] text-[#687570] hover:bg-[#f7faf8] disabled:opacity-40"
                  >
                    <Power className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-[#e4e9e6] px-4 py-6 text-center text-xs text-[#929e99]">
          Belum ada cabang. Tambahkan cabang pertama untuk mulai melayani antrean.
        </p>
      )}

      {!editable && (
        <p className="mt-4 text-[10px] leading-5 text-[#a1aca8]">
          Hanya Super Admin bisnis yang dapat menambah atau mengubah cabang.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-[#a1aca8]">
        {DAYS.map((day, index) => {
          const hours = branches?.[0]?.operatingHours.find((entry) => entry.weekday === index);
          return (
            <span key={day}>
              {day.slice(0, 3)}:{" "}
              {hours ? (hours.closed ? "tutup" : `${hours.opensAt}-${hours.closesAt}`) : "—"}
            </span>
          );
        })}
      </div>
    </section>
  );
}
