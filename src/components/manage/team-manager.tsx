"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Copy, LoaderCircle, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Pager, usePaged } from "@/components/pagination";
import { InlineNotice } from "@/components/inline-notice";

type Role = "OWNER" | "SUPER_ADMIN" | "ADMIN";

type MemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  branchIds: string[];
  counterIds: string[];
  joinedAt: string;
};

type BranchOption = { id: string; name: string };
type CounterOption = { id: string; name: string; code: string; branchId: string };

const roleLabels: Record<Role, string> = {
  OWNER: "Owner",
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin Operasional",
};

const roleHints: Record<Role, string> = {
  OWNER: "Akses penuh, termasuk tagihan dan pengaturan bisnis.",
  SUPER_ADMIN: "Kelola cabang, layanan, loket, tim, dan laporan.",
  ADMIN: "Operasional harian: panggil dan layani antrean.",
};

export function TeamManager({
  businessSlug,
  branches,
  counters,
  canManage,
  currentUserId,
}: {
  businessSlug: string;
  branches: BranchOption[];
  counters: CounterOption[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    email: string;
    role: Role;
    branchIds: string[];
    counterIds: string[];
  } | null>(null);
  const [counterEdit, setCounterEdit] = useState<{
    membershipId: string;
    name: string;
    counterIds: string[];
  } | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");
  const [inviteResult, setInviteResult] = useState<{
    email: string;
    temporaryPassword: string | null;
  } | null>(null);

  const router = useRouter();

  async function load() {
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/team`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memuat tim.");
      setMembers(result.data);
    } catch (error) {
      setMembers([]);
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal memuat tim.");
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
    setInviteResult(null);
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          role: draft.role,
          branchIds: draft.role === "ADMIN" ? draft.branchIds : [],
          counterIds: draft.role === "ADMIN" ? draft.counterIds : [],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menambah anggota.");
      setNoticeVariant("success");
      setNotice(
        `${result.data.email} ditambahkan sebagai ${roleLabels[result.data.role as Role]}.`,
      );
      setInviteResult({
        email: result.data.email,
        temporaryPassword: result.data.temporaryPassword ?? null,
      });
      setDraft(null);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menambah anggota.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: MemberRow, role: Role) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/team/${member.membershipId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengubah peran.");
      setNoticeVariant("success");
      setNotice(`Peran ${member.name} diubah menjadi ${roleLabels[role]}.`);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengubah peran.");
    } finally {
      setBusy(false);
    }
  }

  async function setScopes(member: MemberRow, branchIds: string[]) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/team/${member.membershipId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchIds }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan akses cabang.");
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan akses cabang.");
    } finally {
      setBusy(false);
    }
  }

  async function setCounterScopes(member: MemberRow, counterIds: string[]) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/team/${member.membershipId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterIds }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal menyimpan akses loket.");
      setNoticeVariant("success");
      setNotice(
        counterIds.length
          ? `Akses loket ${member.name} diperbarui (${counterIds.length} loket).`
          : `${member.name} kini bisa menangani semua loket.`,
      );
      setCounterEdit(null);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan akses loket.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: MemberRow) {
    if (!window.confirm(`Keluarkan ${member.name} dari bisnis ini?`)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/team/${member.membershipId}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal mengeluarkan anggota.");
      setNoticeVariant("success");
      setNotice(`${member.name} dikeluarkan dari bisnis.`);
      await reload();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Gagal mengeluarkan anggota.");
    } finally {
      setBusy(false);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleMembers = members
    ? members.filter(
        (member) =>
          !normalizedQuery ||
          member.name.toLowerCase().includes(normalizedQuery) ||
          member.email.toLowerCase().includes(normalizedQuery),
      )
    : members;

  const paged = usePaged(visibleMembers);

  return (
    <section
      id="team"
      className="scroll-mt-28 bubble-card p-5 shadow-bubble-sm md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-.02em]">Tim & akses</h2>
          <p className="mt-1 text-xs text-[#66736e]">
            Atur siapa yang boleh mengelola antrean dan workspace.
          </p>
        </div>
        {canManage && !draft && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex h-9 items-center rounded-lg bubble-card bg-white">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-[#5d6b67]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau email"
                aria-label="Cari anggota tim"
                className="h-9 w-40 rounded-lg bg-transparent pl-8 pr-2 text-xs outline-none placeholder:text-[#646a67] focus:border-brand-600"
              />
            </label>
            <button
            onClick={() =>
              setDraft({ name: "", email: "", role: "ADMIN", branchIds: [], counterIds: [] })
            }
            className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800"
          >
            <CirclePlus className="size-4" /> Tambah anggota
          </button>
          </div>
        )}
      </div>

      {notice && <InlineNotice message={notice} variant={noticeVariant} className="mt-4" />}

      {inviteResult?.temporaryPassword && (
        <div className="mt-4 rounded-xl bg-accent-100 p-4 shadow-bubble-sm">
          <p className="text-[11px] font-semibold text-accent-900">
            Kata sandi sementara untuk {inviteResult.email}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-xs text-accent-900 shadow-bubble-sm">
              {inviteResult.temporaryPassword}
            </code>
            <button
              onClick={() => void navigator.clipboard.writeText(inviteResult.temporaryPassword!)}
              aria-label="Salin kata sandi"
              className="flex size-8 items-center justify-center rounded-lg bg-white text-accent-800 shadow-bubble-sm"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-accent-800">
            Sampaikan lewat kanal aman. Kata sandi ini tidak ditampilkan lagi setelah halaman
            dimuat ulang — minta anggota menggantinya setelah masuk.
          </p>
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
            Nama
            <input
              required
              minLength={2}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="mt-1.5 h-9 w-full rounded-lg bubble-field bg-white px-3 text-xs outline-none"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Email
            <input
              required
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              className="mt-1.5 h-9 w-full rounded-lg bubble-field bg-white px-3 text-xs outline-none"
            />
          </label>
          <label className="text-[11px] font-medium text-[#5d6b65]">
            Peran
            <select
              value={draft.role}
              onChange={(event) =>
                setDraft({ ...draft, role: event.target.value as Role, branchIds: [] })
              }
              className="mt-1.5 h-9 w-full rounded-lg bubble-field bg-white px-3 text-xs outline-none"
            >
              <option value="ADMIN">Admin Operasional</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="OWNER">Owner</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-[#5d6b67]">
              {roleHints[draft.role]}
            </span>
          </label>
          {draft.role === "ADMIN" && branches.length > 0 && (
            <fieldset>
              <legend className="text-[11px] font-medium text-[#5d6b65]">
                Akses cabang
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {branches.map((branch) => {
                  const selected = draft.branchIds.includes(branch.id);
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          branchIds: selected
                            ? draft.branchIds.filter((id) => id !== branch.id)
                            : [...draft.branchIds, branch.id],
                        })
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                        selected
                          ? "border-brand-700 bg-brand-100 text-brand-700"
                          : "border-brand-200 bg-white text-[#687570]"
                      }`}
                    >
                      {branch.name}
                    </button>
                  );
                })}
              </div>
              <span className="mt-1 block text-[11px] text-[#5d6b67]">
                Tanpa pilihan = semua cabang.
              </span>
            </fieldset>
          )}
          {draft.role === "ADMIN" && counters.length > 0 && (
            <fieldset className="sm:col-span-2">
              <legend className="text-[11px] font-medium text-[#5d6b65]">
                Akses loket (opsional)
              </legend>
              <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {counters
                  .filter(
                    (counter) =>
                      !draft.branchIds.length || draft.branchIds.includes(counter.branchId),
                  )
                  .map((counter) => {
                    const selected = draft.counterIds.includes(counter.id);
                    return (
                      <button
                        key={counter.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={busy}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            counterIds: selected
                              ? draft.counterIds.filter((id) => id !== counter.id)
                              : [...draft.counterIds, counter.id],
                          })
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50 ${
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
                Tanpa pilihan = boleh menangani semua loket di cabangnya.
              </span>
            </fieldset>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-full bg-brand-700 px-3.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Tambah
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

      <div className="mt-4 divide-y divide-brand-100">
        {members === null && (
          <p className="py-6 text-center text-xs text-[#5d6b67]">Memuat anggota…</p>
        )}
        {paged.rows?.map((member) => {
          const isSelf = member.userId === currentUserId;
          const editing = counterEdit?.membershipId === member.membershipId;
          const memberCounters = counters.filter(
            (counter) =>
              !member.branchIds.length || member.branchIds.includes(counter.branchId),
          );
          return (
            <div key={member.membershipId} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                {member.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-xs font-semibold text-[#344440]">{member.name}</p>
                  {isSelf && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[9px] font-medium text-brand-600">
                      Anda
                    </span>
                  )}
                  {!member.active && (
                    <span className="rounded-full bg-[#fbefef] px-2 py-0.5 text-[9px] font-medium text-[#bd6e6e]">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[11px] text-[#66736e]">
                  {member.email}
                  {member.role === "ADMIN" &&
                    ` · ${
                      member.branchIds.length
                        ? `${member.branchIds.length} cabang`
                        : "semua cabang"
                    } · ${
                      member.counterIds.length
                        ? `${member.counterIds.length} loket`
                        : "semua loket"
                    }`}
                </p>
              </div>
              {canManage && !isSelf ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={member.role}
                    disabled={busy}
                    onChange={(event) => void changeRole(member, event.target.value as Role)}
                    aria-label={`Peran ${member.name}`}
                    className="h-8 rounded-lg bubble-btn bg-white px-2 text-[11px] text-[#687570] disabled:opacity-50"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="OWNER">Owner</option>
                  </select>
                  {member.role === "ADMIN" && branches.length > 1 && (
                    <select
                      value={member.branchIds[0] ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        void setScopes(member, event.target.value ? [event.target.value] : [])
                      }
                      aria-label={`Cabang ${member.name}`}
                      className="h-8 max-w-28 rounded-lg bubble-btn bg-white px-2 text-[11px] text-[#687570] disabled:opacity-50"
                    >
                      <option value="">Semua cabang</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {member.role === "ADMIN" && counters.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setCounterEdit({
                          membershipId: member.membershipId,
                          name: member.name,
                          counterIds: member.counterIds,
                        })
                      }
                      aria-expanded={
                        counterEdit?.membershipId === member.membershipId
                      }
                      className={`h-8 rounded-lg border px-2 text-[11px] font-medium disabled:opacity-50 ${
                        member.counterIds.length
                          ? "border-brand-300 bg-brand-100 text-brand-700"
                          : "border-brand-200 bg-white text-[#687570]"
                      }`}
                    >
                      {member.counterIds.length
                        ? `Loket (${member.counterIds.length})`
                        : "Semua loket"}
                    </button>
                  )}
                  <button
                    onClick={() => void remove(member)}
                    disabled={busy}
                    aria-label={`Keluarkan ${member.name}`}
                    className="rounded-lg p-2 text-[#b4756d] hover:bg-[#fdf3f2] disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-[#5f6d67]">
                  <ShieldCheck className="size-3.5" />
                  {roleLabels[member.role]}
                </span>
              )}
              </div>
              {editing && (
                <div className="mt-2.5 bubble-panel bg-brand-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-[#344440]">
                      Loket yang ditangani {member.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => setCounterEdit(null)}
                      className="text-[11px] font-medium text-[#7d8a85] hover:text-[#344440]"
                    >
                      Tutup
                    </button>
                  </div>
                  {memberCounters.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {memberCounters.map((counter) => {
                        const selected = counterEdit.counterIds.includes(counter.id);
                        return (
                          <button
                            key={counter.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setCounterEdit({
                                ...counterEdit,
                                counterIds: selected
                                  ? counterEdit.counterIds.filter((id) => id !== counter.id)
                                  : [...counterEdit.counterIds, counter.id],
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
                  ) : (
                    <p className="mt-2 text-[11px] text-[#5d6b67]">
                      Belum ada loket di cabang ini.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] leading-4 text-[#5d6b67]">
                    Tanpa pilihan = semua loket. Operator yang dibatasi hanya melihat dan bisa
                    memanggil tiket untuk loket pilihannya.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setCounterScopes(member, counterEdit.counterIds)}
                      className="h-8 rounded-full bg-brand-700 px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      Simpan akses loket
                    </button>
                    {counterEdit.counterIds.length > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setCounterScopes(member, [])}
                        className="h-8 rounded-lg bubble-btn px-3 text-[11px] font-medium text-[#687570] disabled:opacity-50"
                      >
                        Beri semua loket
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visibleMembers?.length === 0 && (
          <p className="py-6 text-center text-xs text-[#5d6b67]">
            Tidak ada anggota yang cocok dengan “{query.trim()}”.
          </p>
        )}
        {visibleMembers && visibleMembers.length > 0 && (
          <Pager
            total={paged.total}
            page={paged.page}
            pageCount={paged.pageCount}
            pageSize={paged.pageSize}
            unit="anggota"
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
          />
        )}
      </div>
    </section>
  );
}
