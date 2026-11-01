"use client";

import { timezoneOr, viewerTimeZone } from "@/modules/shared/timezone";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CirclePlus, Clock, LoaderCircle, Pencil, Power, X } from "lucide-react";
import { Pager, usePaged } from "@/components/pagination";
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

type Hours = { weekday: number; opensAt: string; closesAt: string; closed: boolean };

/**
 * Ringkas jam sepekan jadi satu baris: hari berurutan dengan jam sama digabung
 * ("Sen–Jum 08:00–17:00 · Sab 09:00–12:00 · Min tutup").
 */
function hoursLabel(hours: Hours[]) {
  if (!hours.length) return "Jam operasional belum diatur";
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);
  const groups: { from: string; to: string; text: string }[] = [];
  const label = (hour: Hours) => (hour.closed ? "tutup" : `${hour.opensAt}–${hour.closesAt}`);
  for (const hour of sorted) {
    const text = label(hour);
    const last = groups.at(-1);
    if (last && last.text === text && DAYS.indexOf(last.to) === hour.weekday - 1) {
      last.to = DAYS[hour.weekday];
      continue;
    }
    groups.push({ from: DAYS[hour.weekday], to: DAYS[hour.weekday], text });
  }
  return groups
    .map((group) => `${group.from === group.to ? group.from : `${group.from}–${group.to}`} ${group.text}`)
    .join(" · ");
}

const defaultHours = (): Hours[] =>
  DAYS.map((_, weekday) => ({
    weekday,
    opensAt: "08:00",
    closesAt: "17:00",
    closed: weekday === 0,
  }));

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
  // Zona perangkat ikut ditawarkan supaya owner di WITA/WIT tak terkunci WIB.
  const [zones] = useState(() => Array.from(new Set([...TIMEZONES, viewerTimeZone()])));
  const paged = usePaged(branches);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hoursEdit, setHoursEdit] = useState<{ branchId: string; name: string; rows: Hours[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");

  const router = useRouter();

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

  /**
   * Sesudah perubahan: muat ulang daftar di sini DAN render ulang server
   * (select, metrik, kartu ringkasan) supaya tidak perlu refresh manual.
   */
  async function reload() {
    await load();
    router.refresh();
  }

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
      await reload();
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
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengubah status cabang.");
    } finally {
      setBusy(false);
    }
  }

  /** Jam operasional disimpan lewat endpoint cabang yang sama, untuk cabang itu saja. */
  async function saveHours() {
    if (!hoursEdit) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/branches?branchId=${encodeURIComponent(hoursEdit.branchId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatingHours: hoursEdit.rows }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan jam operasional.");
      setNoticeVariant("success");
      setNotice(`Jam operasional ${hoursEdit.name} diperbarui.`);
      setHoursEdit(null);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan jam operasional.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleClosed(weekday: number) {
    setHoursEdit((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.weekday === weekday ? { ...row, closed: !row.closed } : row,
            ),
          }
        : current,
    );
  }

  async function setHour(weekday: number, field: "opensAt" | "closesAt", value: string) {
    setHoursEdit((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.weekday === weekday ? { ...row, [field]: value } : row)),
          }
        : current,
    );
  }

  function edit(branch: BranchRow) {
    setNotice("");
    setDraft({
      id: branch.id,
      name: branch.name,
      timezone: viewerTimeZone(branch.timezone),
      ticketPrefix: branch.ticketPrefix,
      estimateBuffer: branch.estimateBuffer,
    });
  }

  const editable = canManage;

  return (
    <section
      id="branches"
      className="scroll-mt-28 bubble-card p-5 shadow-bubble-sm md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-.02em]">
            <Building2 className="size-4 text-brand-700" /> Cabang
          </h2>
          <p className="mt-1 text-xs text-[#66736e]">
            Setiap cabang punya loket, layanan, dan penomoran antreannya sendiri.
          </p>
        </div>
        {editable && !draft && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setDraft({ ...emptyDraft, timezone: viewerTimeZone() });
            }}
            className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800"
          >
            <CirclePlus className="size-3.5" /> Cabang baru
          </button>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      {draft && (
        <form
          className="mt-4 bubble-panel bg-brand-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-brand-800">
              {draft.id ? "Ubah cabang" : "Tambah cabang"}
            </p>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label="Tutup formulir cabang"
              className="rounded-lg p-1.5 text-[#5c6a65] hover:bg-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-medium text-[#53615b]">
              Nama cabang
              <input
                required
                minLength={2}
                maxLength={80}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Cabang Sudirman"
                className="mt-1 block h-9 w-full rounded-lg bubble-panel px-2.5 text-xs text-[#344440]"
              />
            </label>
            <label className="text-[11px] font-medium text-[#53615b]">
              Zona waktu
              <select
                value={draft.timezone}
                onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                className="mt-1 block h-9 w-full rounded-lg bubble-card bg-white px-2.5 text-xs text-[#344440]"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-medium text-[#53615b]">
              Prefiks nomor antrean
              <input
                maxLength={4}
                value={draft.ticketPrefix}
                onChange={(event) => setDraft({ ...draft, ticketPrefix: event.target.value })}
                placeholder="Q"
                className="mt-1 block h-9 w-full rounded-lg bubble-panel px-2.5 font-mono text-xs text-[#344440]"
              />
            </label>
            <label className="text-[11px] font-medium text-[#53615b]">
              Penyangga estimasi (menit)
              <input
                type="number"
                min={0}
                max={120}
                value={draft.estimateBuffer}
                onChange={(event) =>
                  setDraft({ ...draft, estimateBuffer: Number(event.target.value) || 0 })
                }
                className="mt-1 block h-9 w-full rounded-lg bubble-panel px-2.5 text-xs text-[#344440]"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              {draft.id ? "Simpan perubahan" : "Tambah cabang"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-9 rounded-lg bubble-panel px-3 text-xs font-medium text-[#687570]"
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
        <div className="mt-4 divide-y divide-brand-50 overflow-hidden bubble-panel">
          {paged.rows?.map((branch) => (
            <div key={branch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-brand-50 text-[11px] font-bold text-brand-700">
                {branch.ticketPrefix}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold text-[#344440]">
                  {branch.name}
                  {branch.id === currentBranchId && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-medium text-brand-700">
                      Sedang dibuka
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-[#66736e]">
                  {timezoneOr(branch.timezone)} · {branch.counterCount} loket · {branch.queueCount} antrean
                  {branch.resetDaily ? " · reset harian" : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-[#7d8a85]">
                  <Clock className="mr-1 inline size-3 align-[-2px]" />
                  {hoursLabel(branch.operatingHours)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                  branch.active ? "bg-brand-100 text-brand-700" : "bg-brand-50 text-[#74817c]"
                }`}
              >
                {branch.active ? "Aktif" : "Nonaktif"}
              </span>
              {editable && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNotice("");
                      setHoursEdit({
                        branchId: branch.id,
                        name: branch.name,
                        rows: defaultHours().map(
                          (fallback) =>
                            branch.operatingHours.find((hour) => hour.weekday === fallback.weekday) ??
                            fallback,
                        ),
                      });
                    }}
                    disabled={busy}
                    aria-label={`Atur jam operasional ${branch.name}`}
                    aria-expanded={hoursEdit?.branchId === branch.id}
                    className="flex size-8 items-center justify-center rounded-lg bubble-panel text-[#687570] hover:bg-brand-50 disabled:opacity-40"
                  >
                    <Clock className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => edit(branch)}
                    disabled={busy}
                    aria-label={`Ubah ${branch.name}`}
                    className="flex size-8 items-center justify-center rounded-lg bubble-panel text-[#687570] hover:bg-brand-50 disabled:opacity-40"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(branch)}
                    disabled={busy}
                    aria-label={branch.active ? `Nonaktifkan ${branch.name}` : `Aktifkan ${branch.name}`}
                    className="flex size-8 items-center justify-center rounded-lg bubble-panel text-[#687570] hover:bg-brand-50 disabled:opacity-40"
                  >
                    <Power className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl px-4 py-6 text-center text-xs text-[#66736e] bubble-panel">
          Belum ada cabang. Tambahkan cabang pertama untuk mulai melayani antrean.
        </p>
      )}

      {hoursEdit && (
        <div className="mt-3 bubble-panel bg-brand-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-brand-800">
              Jam operasional {hoursEdit.name}
            </p>
            <button
              type="button"
              onClick={() => setHoursEdit(null)}
              aria-label="Tutup jam operasional"
              className="rounded-lg p-1.5 text-[#5c6a65] hover:bg-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[#66736e]">
            Hari tutup tidak akan muncul sebagai pilihan di booking online.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {hoursEdit.rows.map((row) => (
              <div key={row.weekday} className="flex items-center gap-2 rounded-lg bubble-card bg-white px-3 py-2">
                <span className="w-14 text-[11px] font-medium text-[#53615b]">{DAYS[row.weekday]}</span>
                <input
                  type="time"
                  value={row.opensAt}
                  disabled={row.closed || busy}
                  onChange={(event) => void setHour(row.weekday, "opensAt", event.target.value)}
                  aria-label={`Jam buka ${DAYS[row.weekday]}`}
                  className="h-8 rounded-lg bubble-panel px-2 text-xs text-[#344440] disabled:opacity-40"
                />
                <span className="text-[11px] text-[#83918b]">–</span>
                <input
                  type="time"
                  value={row.closesAt}
                  disabled={row.closed || busy}
                  onChange={(event) => void setHour(row.weekday, "closesAt", event.target.value)}
                  aria-label={`Jam tutup ${DAYS[row.weekday]}`}
                  className="h-8 rounded-lg bubble-panel px-2 text-xs text-[#344440] disabled:opacity-40"
                />
                <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#53615b]">
                  <input
                    type="checkbox"
                    checked={row.closed}
                    disabled={busy}
                    onChange={() => void toggleClosed(row.weekday)}
                    className="size-3.5 accent-[var(--color-brand-700)]"
                  />
                  Tutup
                </label>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveHours()}
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Simpan jam operasional
            </button>
            <button
              type="button"
              onClick={() => setHoursEdit(null)}
              className="h-9 rounded-lg bubble-panel px-3 text-xs font-medium text-[#687570]"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <Pager
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          unit="cabang"
          onPage={paged.setPage}
          onPageSize={paged.setPageSize}
        />
      </div>

      {!editable && (
        <p className="mt-4 text-[11px] leading-5 text-[#5d6b67]">
          Hanya Super Admin bisnis yang dapat menambah atau mengubah cabang.
        </p>
      )}

    </section>
  );
}
