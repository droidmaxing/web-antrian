"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CirclePlus,
  Copy,
  LoaderCircle,
  Monitor,
  Pencil,
  RefreshCw,
  Trash2,
  Tv,
} from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { Pager, usePaged } from "@/components/pagination";

type DisplayRow = {
  id: string;
  branchId: string;
  name: string;
  active: boolean;
  createdAt: string;
  counterIds: string[];
};

type BranchRow = { id: string; name: string };
type CounterRow = { id: string; name: string; code: string; branchId: string };

type Draft = {
  id: string | null;
  name: string;
  branchId: string;
  counterIds: string[];
};

export function DisplaysManager({
  businessSlug,
  counters,
  canManage,
}: {
  businessSlug: string;
  counters: CounterRow[];
  canManage: boolean;
}) {
  const [displays, setDisplays] = useState<DisplayRow[] | null>(null);
  const paged = usePaged(displays);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scopeEdit, setScopeEdit] = useState<{
    id: string;
    name: string;
    branchId: string;
    counterIds: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");
  // The plaintext token only ever exists in this response; the server stores a hash.
  const [freshToken, setFreshToken] = useState<{ name: string; token: string } | null>(null);
  const requestRef = useRef(0);
  // Read once on the client; keeps SSR markup free of a server-side origin guess.
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );

  const router = useRouter();

  const load = useCallback(async () => {
    const ticket = ++requestRef.current;
    try {
      const [displayResponse, branchResponse] = await Promise.all([
        fetch(`/api/v1/businesses/${businessSlug}/displays`, { cache: "no-store" }),
        fetch(`/api/v1/businesses/${businessSlug}/branches`, { cache: "no-store" }),
      ]);
      const displayResult = await displayResponse.json();
      if (ticket !== requestRef.current) return;
      if (!displayResponse.ok) {
        throw new Error(displayResult.error?.message ?? "Gagal memuat display.");
      }
      setDisplays(displayResult.data);
      if (branchResponse.ok) {
        const branchResult = await branchResponse.json();
        setBranches(
          (branchResult.data ?? []).map((branch: { id: string; name: string }) => ({
            id: branch.id,
            name: branch.name,
          })),
        );
      }
    } catch (error) {
      if (ticket !== requestRef.current) return;
      setDisplays([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat display.");
    }
  }, [businessSlug]);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      await Promise.resolve();
      if (!stopped) await load();
    })();
    return () => {
      stopped = true;
    };
  }, [load]);

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
    if (draft.name.trim().length < 2) {
      setNoticeVariant("error");
      setNotice("Nama display minimal 2 karakter.");
      return;
    }
    if (!draft.id && !draft.branchId) {
      setNoticeVariant("error");
      setNotice("Pilih cabang untuk display ini.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        draft.id
          ? `/api/v1/businesses/${businessSlug}/displays/${draft.id}`
          : `/api/v1/businesses/${businessSlug}/displays`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            draft.id
              ? { name: draft.name.trim(), counterIds: draft.counterIds }
              : {
                  name: draft.name.trim(),
                  branchId: draft.branchId,
                  counterIds: draft.counterIds,
                },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan display.");
      if (!draft.id && result.data?.token) {
        setFreshToken({ name: draft.name.trim(), token: result.data.token });
      }
      setNoticeVariant("success");
      setNotice(draft.id ? "Display diperbarui." : "Display baru dibuat.");
      setDraft(null);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan display.");
    } finally {
      setBusy(false);
    }
  }

  async function rotate(display: DisplayRow) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Ganti tautan untuk "${display.name}"? Layar yang memakai tautan lama akan langsung berhenti.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/displays/${display.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotateToken: true }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengganti tautan.");
      setFreshToken({ name: display.name, token: result.data.token });
      setNoticeVariant("success");
      setNotice("Tautan baru dibuat. Salin sekarang — tidak akan ditampilkan lagi.");
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengganti tautan.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(display: DisplayRow) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/displays/${display.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !display.active }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengubah status.");
      setNoticeVariant("success");
      setNotice(display.active ? "Display dinonaktifkan." : "Display diaktifkan.");
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(display: DisplayRow) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Hapus display "${display.name}"? Tautan layarnya tidak akan berlaku lagi.`)
    ) {
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/displays/${display.id}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error?.message ?? "Gagal menghapus display.");
      }
      setNoticeVariant("success");
      setNotice(`Display ${display.name} dihapus.`);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menghapus display.");
    } finally {
      setBusy(false);
    }
  }

  async function setScope(display: DisplayRow, counterIds: string[]) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/displays/${display.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterIds }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan cakupan loket.");
      setNoticeVariant("success");
      setNotice(
        counterIds.length
          ? `Display ${display.name} kini hanya menampilkan ${counterIds.length} loket.`
          : `Display ${display.name} kembali menampilkan semua loket.`,
      );
      setScopeEdit(null);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan cakupan loket.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(token: string) {
    const url = `${origin}/display/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setNoticeVariant("success");
      setNotice("Tautan display disalin.");
    } catch {
      setNoticeVariant("error");
      setNotice(`Salin manual: ${url}`);
    }
  }

  return (
    <section
      id="displays-manage"
      className="scroll-mt-28 bubble-card p-5 shadow-bubble-sm md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Layar display</h2>
          <p className="mt-1 text-xs text-[#66736e]">
            Layar TV yang menampilkan antrean dan memutar suara panggilan
            {displays ? ` · ${displays.length} layar` : ""}. Tiap layar punya
            tautannya sendiri, jadi tiap loket bisa punya layarnya masing-masing.
          </p>
        </div>
        {canManage && branches.length > 0 && (
          <button
            onClick={() =>
              setDraft({ id: null, name: "", branchId: branches[0].id, counterIds: [] })
            }
            className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800"
          >
            <CirclePlus className="size-4" /> Tambah display
          </button>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      {freshToken && (
        <div className="mt-4 bubble-panel bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-brand-800">
            <Tv className="size-4" /> Tautan untuk {freshToken.name}
          </p>
          <p className="mt-1 text-[11px] text-[#5d7a70]">
            Buka tautan ini di perangkat layar. Simpan sekarang — tautan tidak ditampilkan lagi.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bubble-card bg-white px-3 py-2 text-[11px] text-brand-900">
              {`${origin}/display/${freshToken.token}`}
            </code>
            <button
              onClick={() => void copyLink(freshToken.token)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-brand-700 px-3 text-[11px] font-semibold text-white"
            >
              <Copy className="size-3.5" /> Salin
            </button>
            <button
              onClick={() => setFreshToken(null)}
              className="h-8 rounded-lg bubble-panel px-3 text-[11px] font-medium text-[#5d7a70]"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 grid gap-3 bubble-panel bg-brand-50 p-4 sm:grid-cols-2"
        >
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Nama layar
            <input
              required
              minLength={2}
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="TV Ruang Tunggu"
              className="mt-1.5 h-9 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Cabang
            <select
              disabled={Boolean(draft.id)}
              value={draft.branchId}
              onChange={(event) =>
                setDraft({ ...draft, branchId: event.target.value, counterIds: [] })
              }
              className="mt-1.5 h-9 w-full rounded-lg bubble-field bg-white px-3 text-xs text-[#344440] outline-none disabled:bg-[#f4f6f5]"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-[11px] font-medium text-[#5d6b65]">
              Tampilkan antrean dari
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={draft.counterIds.length === 0}
                onClick={() => setDraft({ ...draft, counterIds: [] })}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                  draft.counterIds.length === 0
                    ? "border-brand-700 bg-brand-100 text-brand-700"
                    : "border-brand-200 bg-white text-[#687570]"
                }`}
              >
                Semua loket
              </button>
              {counters
                .filter((counter) => counter.branchId === draft.branchId)
                .map((counter) => {
                  const selected = draft.counterIds.includes(counter.id);
                  return (
                    <button
                      key={counter.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          counterIds: selected
                            ? draft.counterIds.filter((id) => id !== counter.id)
                            : [...draft.counterIds, counter.id],
                        })
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                        selected
                          ? "border-brand-700 bg-brand-100 text-brand-700"
                          : "border-brand-200 bg-white text-[#687570]"
                      }`}
                    >
                      {counter.code} · {counter.name}
                    </button>
                  );
                })}
            </div>
            <span className="mt-1 block text-[11px] text-[#5d6b67]">
              Pilih satu atau beberapa loket untuk layar di ruang tunggu tertentu. Layar selalu
              ikut menampilkan daftar antrean yang menunggu.
            </span>
          </fieldset>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Simpan
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-9 rounded-lg bubble-panel px-3.5 text-xs font-medium text-[#687570]"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {displays === null && (
          <p className="py-6 text-center text-xs text-[#5d6b67]">Memuat display…</p>
        )}
        {paged.rows?.map((display) => {
          const scopeCounters = counters.filter(
            (counter) =>
              counter.branchId === display.branchId && display.counterIds.includes(counter.id),
          );
          const editingScope = scopeEdit?.id === display.id;
          const editableCounters = counters.filter(
            (counter) => counter.branchId === (scopeEdit?.branchId ?? display.branchId),
          );
          return (
          <div key={display.id} className="bubble-panel p-3">
            <div className="flex flex-wrap items-center gap-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                display.active ? "bg-brand-50 text-brand-700" : "bg-[#f4f2f1] text-[#a3928c]"
              }`}
            >
              <Monitor className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#344440]">{display.name}</p>
              <p className="mt-1 truncate text-[11px] text-[#66736e]">
                {branches.find((branch) => branch.id === display.branchId)?.name ?? "Cabang"} ·{" "}
                {display.active ? "Aktif" : "Nonaktif"} ·{" "}
                {scopeCounters.length
                  ? `loket ${scopeCounters.map((counter) => counter.code).join(", ")}`
                  : "semua loket"}
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setScopeEdit(
                      editingScope
                        ? null
                        : {
                            id: display.id,
                            name: display.name,
                            branchId: display.branchId,
                            counterIds: display.counterIds,
                          },
                    )
                  }
                  disabled={busy}
                  aria-expanded={editingScope}
                  className={`h-8 rounded-lg border px-2 text-[11px] font-medium disabled:opacity-40 ${
                    display.counterIds.length
                      ? "border-brand-300 bg-brand-100 text-brand-700"
                      : "border-brand-200 bg-white text-[#687570]"
                  }`}
                >
                  {display.counterIds.length ? "Loket terpilih" : "Semua loket"}
                </button>
                <button
                  onClick={() => void rotate(display)}
                  disabled={busy}
                  aria-label={`Ganti tautan ${display.name}`}
                  title="Terbitkan tautan baru untuk layar ini"
                  className="flex h-8 items-center gap-1 rounded-lg bubble-btn bg-white px-2 text-[11px] font-medium text-[#687570] hover:bg-brand-50 disabled:opacity-40"
                >
                  <RefreshCw className="size-3.5" /> Tautan baru
                </button>
                <button
                  onClick={() => void toggleActive(display)}
                  disabled={busy}
                  aria-label={display.active ? `Nonaktifkan ${display.name}` : `Aktifkan ${display.name}`}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#6f7d78] hover:bg-brand-50 disabled:opacity-40"
                >
                  {display.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
                <button
                  onClick={() =>
                    setDraft({
                      id: display.id,
                      name: display.name,
                      branchId: display.branchId,
                      counterIds: display.counterIds,
                    })
                  }
                  aria-label={`Ubah ${display.name}`}
                  className="rounded-lg p-2 text-[#5c6a65] hover:bg-brand-50"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => void remove(display)}
                  disabled={busy}
                  aria-label={`Hapus ${display.name}`}
                  className="rounded-lg p-2 text-[#a8736b] hover:bg-[#fbf2f0] disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
            </div>
            {editingScope && (
              <div className="mt-2.5 bubble-panel bg-brand-50 p-3">
                <p className="text-[11px] font-semibold text-[#344440]">
                  Pilih loket yang tampil di {display.name}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={scopeEdit.counterIds.length === 0}
                    onClick={() => setScopeEdit({ ...scopeEdit, counterIds: [] })}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                      scopeEdit.counterIds.length === 0
                        ? "border-brand-700 bg-brand-100 text-brand-700"
                        : "border-brand-200 bg-white text-[#687570]"
                    }`}
                  >
                    Semua loket
                  </button>
                  {editableCounters.map((counter) => {
                    const selected = scopeEdit.counterIds.includes(counter.id);
                    return (
                      <button
                        key={counter.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setScopeEdit({
                            ...scopeEdit,
                            counterIds: selected
                              ? scopeEdit.counterIds.filter((id) => id !== counter.id)
                              : [...scopeEdit.counterIds, counter.id],
                          })
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                          selected
                            ? "border-brand-700 bg-brand-100 text-brand-700"
                            : "border-brand-200 bg-white text-[#687570]"
                        }`}
                      >
                        {counter.code} · {counter.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-[#5d6b67]">
                  Tanpa pilihan = layar menampilkan semua loket cabang. Daftar antrean menunggu
                  ikut menyesuaikan loket yang dipilih.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setScope(display, scopeEdit.counterIds)}
                    className="h-8 rounded-full bg-brand-700 px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Simpan cakupan
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeEdit(null)}
                    className="h-8 rounded-lg bubble-panel px-3 text-[11px] font-medium text-[#687570]"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })}
        {displays?.length === 0 && (
          <p className="rounded-xl px-4 py-6 text-center text-xs text-[#5d6b67] bubble-panel">
            {branches.length === 0
              ? "Buat cabang terlebih dahulu sebelum menambah layar."
              : "Belum ada layar display. Tambahkan untuk menampilkan antrean di ruang tunggu."}
          </p>
        )}
        <Pager
          total={paged.total}
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={paged.pageSize}
          unit="layar"
          onPage={paged.setPage}
          onPageSize={paged.setPageSize}
        />
      </div>
    </section>
  );
}
