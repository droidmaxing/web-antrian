"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Contact2,
  Layers,
  LayoutDashboard,
  LogOut,
  MonitorCog,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Users2,
  Volume2,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { InlineNotice } from "@/components/inline-notice";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureKey, MembershipRole, QueueStatus } from "@prisma/client";
import { FeatureSettings } from "@/components/feature-settings";
import { AccessLinks } from "@/components/access-links";
import { ServicesManager } from "@/components/manage/services-manager";
import { CountersManager } from "@/components/manage/counters-manager";
import { TeamManager } from "@/components/manage/team-manager";
import { ReportsManager } from "@/components/manage/reports-manager";
import { BranchesManager } from "@/components/manage/branches-manager";
import { CustomersManager } from "@/components/manage/customers-manager";
import { DisplaysManager } from "@/components/manage/displays-manager";
import {
  AnnouncementLedger,
  buildAnnouncementText,
  shouldAnnounce,
} from "@/modules/announcement/announcement";
import { buildAnnouncementClips } from "@/modules/announcement/audio-clips";
import {
  AnnouncementAudioPlayer,
  type AudioPlayerStatus,
} from "@/modules/announcement/audio-player";
import {
  BookingManagement,
  type BookingRow,
} from "@/components/booking-management";

type QueueRow = {
  id: string;
  ticketNumber: string;
  status: QueueStatus;
  issuedAt: string;
  serviceName: string;
  serviceCode: string;
  serviceId: string;
  counterName: string | null;
  counterId: string | null;
  customerName: string;
};

type BranchData = {
  id: string;
  name: string;
  timezone: string;
  services: { id: string; name: string; code: string }[];
  counters: {
    id: string;
    name: string;
    code: string;
    currentTicket: string | null;
    currentService: string | null;
    queueStatus: QueueStatus | null;
    waitingForCounter: number;
  }[];
};

type DashboardProps = {
  businessName: string;
  businessSlug: string;
  branch: BranchData;
  branches: { id: string; name: string }[];
  counters: { id: string; name: string; code: string; branchId: string }[];
  role: MembershipRole;
  user: { id: string; name: string };
  userName: string;
  enabledFeatures: FeatureKey[];
  bookings: BookingRow[];
  metrics: {
    total: number;
    waiting: number;
    active: number;
    completed: number;
    averageWaitMinutes: number;
    averageServiceMinutes: number;
  };
  queues: QueueRow[];
};

const VISIBLE_QUEUE_LIMIT = 8;

/**
 * The dashboard only ever loads today's queues, so this filter narrows the
 * already-loaded list by issue time instead of pretending to change the
 * business date.
 */
type TimeWindow = "today" | "1h" | "3h" | "8h";

const timeWindowHours: Record<TimeWindow, number | null> = {
  today: null,
  "1h": 1,
  "3h": 3,
  "8h": 8,
};

const queueActionLabels: Record<string, string> = {
  recall: "Panggil ulang",
  start: "Mulai layanan",
  complete: "Selesaikan",
  skip: "Lewati",
  "no-show": "Tidak hadir",
  "return-to-waiting": "Kembalikan ke antrean",
  cancel: "Batalkan",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortName(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Dashboard({
  businessName,
  businessSlug,
  branch,
  branches,
  counters: counterOptions,
  role,
  user,
  userName,
  enabledFeatures,
  bookings,
  metrics,
  queues,
}: DashboardProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");
  const canOperate = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";
  const canConfigure = role === "SUPER_ADMIN" || role === "OWNER";
  const canManageTeam = role === "OWNER" || role === "SUPER_ADMIN";
  const isOwner = role === "OWNER";
  const analyticsEnabled =
    enabledFeatures.includes("ANALYTICS") &&
    (isOwner || role === "SUPER_ADMIN");
  const voiceEnabled = enabledFeatures.includes("VOICE_CALL");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [spoken, setSpoken] = useState("");
  const [queueQuery, setQueueQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "LIVE" | QueueStatus>("LIVE");
  const [counterFilter, setCounterFilter] = useState<string>("ALL");
  const [audioStatus, setAudioStatus] = useState<AudioPlayerStatus>("idle");
  const [showAllQueues, setShowAllQueues] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("today");
  // Captured from the click that selects a window: keeps render pure (no
  // Date.now() during render) while still filtering relative to "now".
  const [windowAnchor, setWindowAnchor] = useState<number | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const ledger = useRef(new AnnouncementLedger());
  const playerRef = useRef<AnnouncementAudioPlayer | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Signing out with a callbackUrl makes Auth.js build an absolute URL on the
  // server, which can resolve to a different origin than the one the operator
  // is actually browsing (e.g. localhost vs the real domain). Ending the
  // session first and then navigating relative keeps the operator on the
  // origin they are already on.
  const handleSignOut = useCallback(async () => {
    try {
      await signOut({ redirect: false });
    } finally {
      // Relative navigation keeps the operator on the origin they are on; a
      // refresh drops the cached authenticated shell.
      router.replace("/login");
      router.refresh();
    }
  }, [router]);


  useEffect(() => {
    if (!playerRef.current) playerRef.current = new AnnouncementAudioPlayer();
    const player = playerRef.current;
    const unsubscribe = player.onStatusChange((status) => {
      setAudioStatus(status);
      if (status === "ready") setVoiceReady(true);
    });
    return () => {
      unsubscribe();
      player.stop();
    };
  }, []);

  // The operator station speaks the same sentence as the TV display, keyed by
  // the outbox event id so a replayed response never announces twice.
  const announce = useCallback(
    async (payload: {
      eventId?: string | null;
      ticketNumber?: string | null;
      counterName?: string | null;
      status?: string | null;
    }) => {
      if (!voiceEnabled || voiceMuted) return;
      if (!shouldAnnounce(payload.status)) return;
      if (!payload.ticketNumber) return;
      if (payload.eventId && !ledger.current.claim(payload.eventId)) return;

      const text = buildAnnouncementText({
        ticketNumber: payload.ticketNumber,
        counterName: payload.counterName,
      });
      setSpoken(text);

      const player = playerRef.current;
      if (player) {
        const outcome = await player.play(
          buildAnnouncementClips({
            ticketNumber: payload.ticketNumber,
            counterName: payload.counterName,
          }),
        );
        if (outcome === "played") return;
      }

      // Fallback only: the clip set is missing or the browser blocked autoplay.
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "id-ID";
      utterance.rate = 0.95;
      const indonesian = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang?.toLowerCase().startsWith("id"));
      if (indonesian) utterance.voice = indonesian;
      window.speechSynthesis.speak(utterance);
    },
    [voiceEnabled, voiceMuted],
  );

  async function enableVoice() {
    const player = playerRef.current;
    if (!player) return;
    const ready = await player.prime();
    if (ready) {
      setVoiceReady(true);
      setVoiceMuted(false);
    }
  }

  async function callNext(counterId: string) {
    setBusyAction(`call-${counterId}`);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/businesses/${businessSlug}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: branch.id, counterId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Gagal memanggil antrean.");
      setNotice(
        `${result.data.ticketNumber} dipanggil ke ${result.data.counterName ?? "loket"}.`,
      );
      setNoticeVariant("success");
      announce({
        eventId: result.data.eventId,
        ticketNumber: result.data.ticketNumber,
        counterName: result.data.counterName,
        status: result.data.status,
      });
      router.refresh();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runQueueAction(queueId: string, action: string) {
    setBusyAction(`${action}-${queueId}`);
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/businesses/${businessSlug}/queues/${queueId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Aksi antrean gagal.");
      setNotice(`Status antrean berhasil diperbarui.`);
      setNoticeVariant("success");
      if (action === "recall") {
        announce({
          eventId: result.data?.eventId,
          ticketNumber: result.data?.ticketNumber,
          counterName: result.data?.counterName,
          status: result.data?.status,
        });
      }
      router.refresh();
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setBusyAction(null);
    }
  }

  const normalizedQuery = queueQuery.trim().toLowerCase();
  const windowHours = timeWindowHours[timeWindow];
  const windowStart =
    windowHours === null || windowAnchor === null
      ? null
      : windowAnchor - windowHours * 3_600_000;
  const queuesInWindow = windowStart === null
    ? queues
    : queues.filter((queue) => new Date(queue.issuedAt).getTime() >= windowStart);
  const visibleQueues = queuesInWindow.filter((queue) => {
    const matchesStatus =
      statusFilter === "ALL"
        ? true
        : statusFilter === "LIVE"
          ? queue.status === "WAITING" ||
            queue.status === "CALLED" ||
            queue.status === "SERVING"
          : queue.status === statusFilter;
    if (!matchesStatus) return false;
    if (counterFilter !== "ALL") {
      if (counterFilter === "UNASSIGNED") {
        if (queue.counterId) return false;
      } else if (queue.counterId !== counterFilter) {
        return false;
      }
    }
    if (!normalizedQuery) return true;
    return (
      queue.ticketNumber.toLowerCase().includes(normalizedQuery) ||
      queue.customerName.toLowerCase().includes(normalizedQuery) ||
      queue.serviceName.toLowerCase().includes(normalizedQuery) ||
      (queue.counterName ?? "").toLowerCase().includes(normalizedQuery)
    );
  });
  const displayedQueues = showAllQueues
    ? visibleQueues
    : visibleQueues.slice(0, VISIBLE_QUEUE_LIMIT);

  // Real operational alerts derived from live queue state — no placeholder text.
  const alerts: { id: string; title: string; detail: string }[] = [];
  const calledNow = queues.filter(
    (queue) => queue.status === "CALLED" || queue.status === "SERVING",
  );
  if (metrics.waiting > 0 && !calledNow.length) {
    alerts.push({
      id: "waiting-idle",
      title: `${metrics.waiting} antrean menunggu tanpa panggilan aktif`,
      detail: "Panggil nomor berikutnya atau aktifkan loket tambahan.",
    });
  }
  const idleCounters = branch.counters.filter((counter) => !counter.currentTicket);
  if (idleCounters.length && metrics.waiting > 0) {
    alerts.push({
      id: "idle-counters",
      title: `${idleCounters.length} loket menganggur`,
      detail: "Ada antrean menunggu sementara loket ini belum melayani.",
    });
  }
  if (voiceEnabled && canOperate && !voiceReady) {
    alerts.push({
      id: "voice-locked",
      title: "Suara pemanggilan belum aktif",
      detail: "Klik Aktifkan suara agar panggilan otomatis terdengar.",
    });
  }
  if (!branch.counters.length) {
    alerts.push({
      id: "no-counter",
      title: "Belum ada loket di cabang ini",
      detail: "Tambahkan loket supaya antrean bisa dipanggil.",
    });
  }

  // ⌘K / Ctrl+K focuses the header search; Esc clears it. Registered once so
  // the shortcut works from anywhere on the dashboard.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQueueQuery("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8f7] text-[#182321]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[250px] flex-col border-r border-[#e9edeb] bg-white xl:flex">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#f0f3f1] px-4 py-5">
          <div className="flex size-10 items-center justify-center rounded-[13px] bg-[#176b5b] text-white shadow-[0_4px_10px_rgba(23,107,91,.2)]">
            <span className="text-lg font-black">a.</span>
          </div>
          <span className="text-lg font-semibold tracking-[-.04em]">antrian</span>
          <button
            type="button"
            onClick={() => {
              searchRef.current?.focus();
              searchRef.current?.select();
            }}
            aria-label="Cari antrean (⌘K)"
            className="ml-auto rounded-lg p-2 text-[#889590] hover:bg-[#f5f7f6]"
          >
            <Command className="size-4" />
          </button>
        </div>

        {/* The nav list scrolls on its own so the logout button below never
            leaves the viewport on short laptop screens. */}
        <div className="dashboard-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-5">
        <details className="group">
          <summary className="flex w-full cursor-pointer list-none items-center gap-3 rounded-xl border border-[#e9edeb] p-3 text-left transition hover:border-[#cddbd5] [&::-webkit-details-marker]:hidden">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#edf5f1] text-[#176b5b]">
              <span className="text-xs font-bold">{shortName(businessName)}</span>
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{businessName}</span>
              <span className="mt-0.5 block text-xs text-[#889590]">{branch.name}</span>
            </span>
            <ChevronDown className="size-4 text-[#9ba6a2]" />
          </summary>
          <div className="mt-1.5 rounded-xl border border-[#e9edeb] bg-white p-1.5 shadow-[0_12px_32px_rgba(25,48,40,.12)]">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-[#a1aca8]">
              Cabang
            </p>
            {branches.map((option) => (
              <a
                key={option.id}
                href={`/dashboard/${businessSlug}?branch=${encodeURIComponent(option.id)}`}
                className={`block rounded-lg px-2 py-1.5 text-xs ${
                  option.id === branch.id
                    ? "bg-[#edf5f1] font-semibold text-[#176b5b]"
                    : "font-medium text-[#56635f] hover:bg-[#f6f8f7]"
                }`}
              >
                {option.name}
              </a>
            ))}
            {canConfigure && (
              <a
                href="#branches"
                className="mt-1 block rounded-lg border-t border-[#eff2f0] px-2 py-1.5 text-xs font-semibold text-[#176b5b] hover:bg-[#f6f8f7]"
              >
                Kelola cabang
              </a>
            )}
          </div>
        </details>

        <p className="mb-2 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9aa5a1]">
          Operasional
        </p>
        <nav className="space-y-1">
          <NavLink href="#overview" label="Ringkasan" icon={LayoutDashboard} active />
          <NavLink href="#queue" label="Antrean" icon={Users2} badge={metrics.waiting} />
          <NavLink href="#counters" label="Status loket" icon={Radio} />
          {enabledFeatures.includes("BOOKING") && (
            <NavLink href="#bookings" label="Booking" icon={CalendarDays} />
          )}
        </nav>

        <p className="mb-2 mt-8 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9aa5a1]">
          Pengelolaan
        </p>
        <nav className="space-y-1">
          <NavLink href="#services-manage" label="Layanan" icon={Layers} />
          <NavLink href="#counters-manage" label="Loket" icon={MonitorCog} />
          <NavLink href="#customers-manage" label="Pelanggan" icon={Contact2} />
          <NavLink href="#displays-manage" label="Layar TV" icon={Tv} />
          <NavLink href="#branches" label="Cabang" icon={Building2} />
          {canManageTeam && <NavLink href="#team" label="Tim & akses" icon={Users2} />}
          <NavLink href="#reports" label="Laporan" icon={BarChart3} />
          {canConfigure && <NavLink href="#settings" label="Pengaturan" icon={Settings2} />}
        </nav>
        {!analyticsEnabled && (canConfigure || isOwner) && (
          <p className="mx-3 mt-2 text-[11px] leading-4 text-[#9aa5a1]">
            Analitik ringkasan dinonaktifkan untuk bisnis ini.
          </p>
        )}

        <div className="mt-6 rounded-2xl bg-[#edf6f2] p-4">
          <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white text-[#176b5b]">
            <Sparkles className="size-[17px]" />
          </div>
          <p className="text-sm font-semibold">Layanan lebih rapi</p>
          <p className="mt-1 text-xs leading-5 text-[#75827f]">
            Satu tempat untuk mengelola antrean dan pelayanan.
          </p>
          <a
            href="#settings"
            className="mt-3 inline-block text-xs font-semibold text-[#176b5b] hover:underline"
          >
            Pelajari sistem <span aria-hidden="true">↗</span>
          </a>
        </div>
        </div>

        {/* Pinned footer: always visible, never inside the scroll container. */}
        <div className="shrink-0 border-t border-[#eef1f0] bg-white p-3">
          <div className="flex items-center gap-2.5 px-2 pb-2.5">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#e7f1ed] text-[11px] font-bold text-[#276b5b]">
              {shortName(userName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{userName}</p>
              <p className="truncate text-[10px] text-[#929e99]">{roleLabel(role)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-3 rounded-xl border border-[#e9edeb] px-3 py-2.5 text-left text-sm font-medium text-[#4d5a56] transition hover:border-[#e0a99f] hover:bg-[#fdf4f2] hover:text-[#b4553f]"
          >
            <LogOut className="size-4" /> Keluar
          </button>
        </div>
      </aside>

      <section className="xl:pl-[250px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#e9edeb] bg-white/95 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#176b5b] text-sm font-black text-white xl:hidden">
              a.
            </div>
            <div className="hidden items-center gap-2 text-sm text-[#9aa5a1] sm:flex">
              <span>Workspace</span>
              <span>/</span>
              <span className="font-medium text-[#344440]">Ringkasan</span>
            </div>
            <div className="sm:hidden">
              <p className="text-[11px] text-[#889590]">{businessName}</p>
              <p className="text-sm font-semibold">{branch.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden h-9 w-[210px] items-center gap-2 rounded-lg border border-[#edf0ef] bg-[#fafbfa] px-3 md:flex">
              <Search className="size-4 text-[#a1aca8]" />
              <input
                ref={searchRef}
                value={queueQuery}
                onChange={(event) => setQueueQuery(event.target.value)}
                placeholder="Cari nomor, pelanggan, layanan..."
                aria-label="Cari antrean"
                className="min-w-0 flex-1 bg-transparent text-xs text-[#344440] outline-none placeholder:text-[#a1aca8]"
              />
              {queueQuery ? (
                <button
                  type="button"
                  onClick={() => setQueueQuery("")}
                  aria-label="Hapus pencarian"
                  className="text-[10px] text-[#a1aca8] hover:text-[#687570]"
                >
                  Reset
                </button>
              ) : (
                <kbd className="rounded border border-[#e7ebe9] bg-white px-1.5 py-0.5 text-[10px] text-[#a1aca8]">
                  ⌘ K
                </kbd>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNoticeOpen((current) => !current)}
                aria-expanded={noticeOpen}
                aria-label="Notifikasi operasional"
                className="relative flex size-9 items-center justify-center rounded-lg text-[#75827f] hover:bg-[#f5f7f6]"
              >
                <Bell className="size-[18px]" />
                {alerts.length > 0 && (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#e47b69]" />
                )}
              </button>
              {noticeOpen && (
                <div className="absolute right-0 top-11 z-40 w-[290px] rounded-xl border border-[#e9edeb] bg-white p-3 shadow-[0_12px_32px_rgba(25,48,40,.12)]">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[.1em] text-[#a1aca8]">
                    Notifikasi
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {alerts.length ? (
                      alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="rounded-lg border border-[#eff2f0] px-2.5 py-2"
                        >
                          <p className="text-[11px] font-medium text-[#344440]">{alert.title}</p>
                          <p className="mt-0.5 text-[10px] text-[#929e99]">{alert.detail}</p>
                        </div>
                      ))
                    ) : (
                      <p className="px-1 py-3 text-[11px] text-[#a1aca8]">
                        Tidak ada notifikasi. Semua operasional normal.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="mx-1 hidden h-9 w-px bg-[#e9edeb] sm:block" />
            <details className="relative">
              <summary
                aria-label={`Menu akun ${userName}`}
                className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-1 py-1 transition hover:bg-[#f5f7f6] [&::-webkit-details-marker]:hidden"
              >
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold">{userName}</p>
                  <p className="mt-0.5 text-[10px] text-[#929e99]">
                    {roleLabel(role)}
                  </p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-full bg-[#e7f1ed] text-xs font-bold text-[#276b5b]">
                  {shortName(userName)}
                </div>
                <ChevronDown className="size-4 text-[#9ba6a2]" />
              </summary>
              <div className="absolute right-0 top-12 z-40 w-[230px] rounded-xl border border-[#e9edeb] bg-white p-1.5 shadow-[0_12px_32px_rgba(25,48,40,.12)]">
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-semibold">{userName}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[#929e99]">
                    {roleLabel(role)} · {businessName}
                  </p>
                </div>
                <div className="my-1 h-px bg-[#eef1f0]" />
                <a
                  href="#settings"
                  className="block rounded-lg px-2.5 py-2 text-xs font-medium text-[#4d5a56] hover:bg-[#f6f8f7]"
                >
                  Pengaturan akun
                </a>
                <a
                  href="#team"
                  className="block rounded-lg px-2.5 py-2 text-xs font-medium text-[#4d5a56] hover:bg-[#f6f8f7]"
                >
                  Tim &amp; akses
                </a>
                <div className="my-1 h-px bg-[#eef1f0]" />
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[#b4553f] hover:bg-[#fdf4f2]"
                >
                  <LogOut className="size-4" /> Keluar
                </button>
              </div>
            </details>
          </div>
        </header>

        <nav
          aria-label="Navigasi dashboard"
          className="dashboard-mobile-nav sticky top-[72px] z-[9] flex gap-1 overflow-x-auto border-b border-[#e9edeb] bg-white px-3 py-2 xl:hidden"
        >
          <MobileNavLink href="#overview" label="Ringkasan" />
          <MobileNavLink href="#queue" label="Antrean" />
          <MobileNavLink href="#counters" label="Loket" />
          {enabledFeatures.includes("BOOKING") && (
            <MobileNavLink href="#bookings" label="Booking" />
          )}
          <MobileNavLink href="#services-manage" label="Layanan" />
          <MobileNavLink href="#customers-manage" label="Pelanggan" />
          <MobileNavLink href="#displays-manage" label="Layar TV" />
          <MobileNavLink href="#branches" label="Cabang" />
          {canManageTeam && <MobileNavLink href="#team" label="Tim" />}
          <MobileNavLink href="#reports" label="Laporan" />
          {canConfigure && <MobileNavLink href="#settings" label="Pengaturan" />}
        </nav>

        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[#176b5b]">
                <span className="size-1.5 rounded-full bg-[#42a184]" />
                {branches.length > 1 ? (
                  <label className="relative flex items-center">
                    <span className="sr-only">Pilih cabang</span>
                    <select
                      value={branch.id}
                      onChange={(event) =>
                        router.push(
                          `/dashboard/${businessSlug}?branch=${encodeURIComponent(event.target.value)}`,
                        )
                      }
                      className="cursor-pointer appearance-none rounded-md bg-transparent py-0.5 pr-5 text-xs font-medium text-[#176b5b] outline-none hover:bg-[#edf5f1]"
                    >
                      {branches.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 size-3.5" />
                  </label>
                ) : (
                  <span>{branch.name}</span>
                )}
                <span className="text-[#c0c9c5]">·</span>
                {new Intl.DateTimeFormat("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: branch.timezone,
                }).format(new Date())}
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-.04em] sm:text-[30px]">
                Selamat pagi, {userName.split(" ")[0]} <span>👋</span>
              </h1>
              <p className="mt-1.5 text-sm text-[#889590]">
                Pantau operasional dan antrean hari ini.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative flex items-center">
                <span className="sr-only">Rentang waktu antrean</span>
                <CalendarDays className="pointer-events-none absolute left-3 size-4 text-[#889590]" />
                <select
                  value={timeWindow}
                  onChange={(event) => {
                    setTimeWindow(event.target.value as TimeWindow);
                    setWindowAnchor(Date.now());
                  }}
                  className="h-10 cursor-pointer appearance-none rounded-lg border border-[#e4e9e6] bg-white pl-9 pr-8 text-xs font-medium text-[#56635f] shadow-sm outline-none hover:border-[#cddbd5]"
                >
                  <option value="today">Hari ini</option>
                  <option value="1h">1 jam terakhir</option>
                  <option value="3h">3 jam terakhir</option>
                  <option value="8h">8 jam terakhir</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#9aa5a1]" />
              </label>
              {canOperate && (
                <a
                  href="#queue"
                  className="flex h-10 items-center gap-2 rounded-lg bg-[#176b5b] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#125648]"
                >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Kelola antrean</span>
                  <span className="sm:hidden">Antrean</span>
                </a>
              )}
            </div>
          </div>

          {notice && (
            <div className="mb-5 flex items-center gap-3">
              <InlineNotice message={notice} variant={noticeVariant} className="min-w-0 flex-1" />
              <button
                type="button"
                onClick={() => setNotice("")}
                aria-label="Tutup pemberitahuan"
                className="rounded-lg p-2 text-[#889590] hover:bg-white"
              >
                ×
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <MetricCard
              title="Total antrean"
              value={metrics.total}
              note="nomor diterbitkan hari ini"
              icon={Users2}
              tone="green"
              trend="Hari berjalan"
            />
            <MetricCard
              title="Menunggu"
              value={metrics.waiting}
              note="pelanggan dalam antrean"
              icon={Clock3}
              tone="amber"
              trend="Perlu dipantau"
            />
            <MetricCard
              title="Sedang dilayani"
              value={metrics.active}
              note="antrean di loket"
              icon={Activity}
              tone="blue"
              trend="Saat ini"
            />
            <MetricCard
              title="Selesai"
              value={metrics.completed}
              note="pelayanan dituntaskan"
              icon={CheckCheck}
              tone="violet"
              trend="Hari ini"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.9fr)]">
            <section
              id="overview"
              className="rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-.02em]">
                    Aktivitas antrean
                  </h2>
                  <p className="mt-1 text-xs text-[#929e99]">
                    Distribusi tiket hari ini berdasarkan jam
                  </p>
                </div>
                <label className="relative flex items-center gap-2 rounded-lg border border-[#edf0ef] px-3 py-2 text-[11px] font-medium text-[#687570]">
                  <span className="sr-only">Rentang waktu grafik aktivitas</span>
                  <select
                    value={timeWindow}
                    onChange={(event) => {
                      setTimeWindow(event.target.value as TimeWindow);
                      setWindowAnchor(Date.now());
                    }}
                    className="appearance-none bg-transparent pr-4 text-[11px] font-medium text-[#687570] outline-none"
                  >
                    <option value="today">Hari ini</option>
                    <option value="1h">1 jam terakhir</option>
                    <option value="3h">3 jam terakhir</option>
                    <option value="8h">8 jam terakhir</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-[#9aa5a1]" />
                </label>
              </div>
              {analyticsEnabled ? (
                <>
                  <QueueActivityChart queues={queuesInWindow} timezone={branch.timezone} />
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#eff2f0] pt-4 sm:grid-cols-4">
                    <TinyMetric label="Rata-rata waktu tunggu" value={`${metrics.averageWaitMinutes} mnt`} icon={Clock3} />
                    <TinyMetric label="Rata-rata pelayanan" value={`${metrics.averageServiceMinutes} mnt`} icon={Activity} />
                    <TinyMetric label="Layanan tersedia" value={branch.services.length.toString()} icon={Sparkles} />
                    <TinyMetric label="Loket aktif" value={branch.counters.length.toString()} icon={Radio} />
                  </div>
                </>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    title="Analytics dinonaktifkan"
                    description="Hubungi Super Admin untuk mengaktifkan laporan performa."
                  />
                </div>
              )}
            </section>

            <section id="counters" className="rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-.02em]">
                    Status loket
                  </h2>
                  <p className="mt-1 text-xs text-[#929e99]">
                    Kondisi pelayanan saat ini
                  </p>
                </div>
                <details className="group relative">
                  <summary
                    aria-label="Opsi status loket"
                    className="flex cursor-pointer list-none items-center rounded-lg p-1.5 text-[#9aa5a1] hover:bg-[#f6f8f7] [&::-webkit-details-marker]:hidden"
                  >
                    <MoreHorizontal className="size-5" />
                  </summary>
                  <div className="absolute right-0 top-9 z-40 w-56 rounded-xl border border-[#e9edeb] bg-white p-1.5 shadow-[0_12px_32px_rgba(25,48,40,.12)]">
                    <a
                      href="#counters-manage"
                      className="block rounded-lg px-2.5 py-2 text-xs font-medium text-[#56635f] hover:bg-[#f6f8f7]"
                    >
                      Kelola loket
                    </a>
                    <a
                      href="#services-manage"
                      className="block rounded-lg px-2.5 py-2 text-xs font-medium text-[#56635f] hover:bg-[#f6f8f7]"
                    >
                      Kelola layanan
                    </a>
                    {canOperate && (
                      <button
                        type="button"
                        onClick={() => router.refresh()}
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#56635f] hover:bg-[#f6f8f7]"
                      >
                        Segarkan status loket
                      </button>
                    )}
                  </div>
                </details>
              </div>
              {voiceEnabled && canOperate && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eaf1ed] bg-[#f8fbf9] px-3 py-2.5">
                  <p className="flex min-w-0 items-center gap-2 text-[10px] text-[#6c7a74]">
                    <Volume2 className="size-3.5 shrink-0 text-[#4a8b73]" />
                    <span className="truncate">
                      {!voiceReady
                        ? "Aktifkan suara sekali untuk mengizinkan pemanggilan otomatis."
                        : voiceMuted
                          ? "Suara pemanggilan sedang dimatikan di perangkat ini."
                          : audioStatus === "playing"
                            ? "Memutar audio pemanggilan…"
                            : spoken || "Pemanggilan berikutnya akan diumumkan otomatis."}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => (voiceReady ? setVoiceMuted((current) => !current) : enableVoice())}
                    className="shrink-0 rounded-lg border border-[#dbe7e1] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#3c6b58] hover:bg-[#f2f7f4]"
                  >
                    {!voiceReady ? "Aktifkan suara" : voiceMuted ? "Nyalakan suara" : "Matikan suara"}
                  </button>
                </div>
              )}
              <div className="mt-5 space-y-3">
                {branch.counters.map((counter, index) => (
                  <div
                    key={counter.id}
                    className="flex items-center gap-3 rounded-xl border border-[#eff2f0] p-3"
                  >
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${counter.currentTicket ? "bg-[#eaf4ef] text-[#277660]" : "bg-[#f2f4f3] text-[#7c8883]"}`}>
                      {counter.code}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{counter.name}</p>
                        <span className={`size-1.5 rounded-full ${counter.currentTicket ? "bg-[#4aa782]" : "bg-[#c9d0cd]"}`} />
                      </div>
                      <p className="mt-1 truncate text-xs text-[#929e99]">
                        {counter.currentTicket
                          ? `${counter.currentTicket} · ${counter.currentService}`
                          : "Belum ada pelanggan"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[11px] font-medium ${counter.currentTicket ? "text-[#277660]" : "text-[#9aa5a1]"}`}>
                        {counter.currentTicket
                          ? counter.queueStatus === "SERVING"
                            ? "Melayani"
                            : "Dipanggil"
                          : "Tersedia"}
                      </p>
                      {canOperate && !counter.currentTicket && (
                        <button
                          onClick={() => callNext(counter.id)}
                          disabled={
                            busyAction === `call-${counter.id}` ||
                            counter.waitingForCounter === 0
                          }
                          title={
                            counter.waitingForCounter === 0
                              ? "Tidak ada antrean menunggu untuk layanan loket ini."
                              : `Panggil antrean berikutnya (${counter.waitingForCounter} menunggu).`
                          }
                          className="mt-1 text-[10px] font-semibold text-[#176b5b] hover:underline disabled:opacity-40"
                        >
                          {busyAction === `call-${counter.id}`
                            ? "Memanggil..."
                            : counter.waitingForCounter === 0
                              ? "Tidak ada antrean"
                              : `Panggil berikutnya · ${counter.waitingForCounter}`}
                        </button>
                      )}
                    </div>
                    {index === 0 && counter.currentTicket && (
                      <Volume2 className="size-4 text-[#9aa5a1]" />
                    )}
                  </div>
                ))}
                {!branch.counters.length && (
                  <EmptyState title="Belum ada loket" description="Tambahkan loket untuk mulai melayani antrean." />
                )}
              </div>
              <a href="#counters-manage" className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-[#edf0ef] py-2.5 text-xs font-semibold text-[#596661] hover:bg-[#fafbfa]">
                Kelola semua loket <ArrowUpRight className="size-3.5" />
              </a>
            </section>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.9fr)]">
            <section id="queue" className="overflow-hidden rounded-2xl border border-[#e9edeb] bg-white shadow-[0_2px_8px_rgba(25,48,40,.025)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eff2f0] px-5 py-5 md:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold tracking-[-.02em]">Antrean hari ini</h2>
                    <span className="rounded-full bg-[#eff5f2] px-2 py-0.5 text-[10px] font-semibold text-[#397b68]">
                      {queues.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#929e99]">Pantau dan kelola setiap pelanggan</p>
                </div>
                  <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => router.refresh()}
                    className="flex size-9 items-center justify-center rounded-lg border border-[#edf0ef] text-[#76827d] hover:bg-[#f8faf9]"
                    aria-label="Muat ulang antrean"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                  <label className="relative flex h-9 items-center gap-2 rounded-lg border border-[#edf0ef] px-3 text-xs font-medium text-[#687570]">
                    <span className="sr-only">Filter loket</span>
                    <select
                      value={counterFilter}
                      onChange={(event) => setCounterFilter(event.target.value)}
                      className="max-w-[9.5rem] appearance-none bg-transparent pr-4 text-xs font-medium outline-none"
                    >
                      <option value="ALL">Semua loket</option>
                      <option value="UNASSIGNED">Belum ditugaskan</option>
                      {branch.counters.map((counter) => (
                        <option key={counter.id} value={counter.id}>
                          {counter.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5" />
                  </label>
                  <label className="relative flex h-9 items-center gap-2 rounded-lg border border-[#edf0ef] px-3 text-xs font-medium text-[#687570]">
                    <span className="sr-only">Filter status antrean</span>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as "ALL" | "LIVE" | QueueStatus)}
                      className="appearance-none bg-transparent pr-4 text-xs font-medium outline-none"
                    >
                      <option value="LIVE">Aktif & menunggu</option>
                      <option value="ALL">Semua status</option>
                      <option value="WAITING">Menunggu</option>
                      <option value="CALLED">Dipanggil</option>
                      <option value="SERVING">Dilayani</option>
                      <option value="COMPLETED">Selesai</option>
                      <option value="SKIPPED">Lewat</option>
                      <option value="CANCELLED">Dibatalkan</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5" />
                  </label>
                  </div>
              </div>
              {queues.length ? (
                <>
                  <div className="hidden grid-cols-[1.2fr_1fr_1.1fr_.8fr_1fr] gap-4 bg-[#fafbfa] px-6 py-3 text-[10px] font-semibold uppercase tracking-[.1em] text-[#a1aca8] md:grid">
                    <span>Nomor antrean</span>
                    <span>Pelanggan</span>
                    <span>Layanan</span>
                    <span>Status</span>
                    <span className="text-right">Aksi</span>
                  </div>
                  <div className="divide-y divide-[#eff2f0]">
                    {displayedQueues.map((queue) => (
                      <QueueItem
                        key={queue.id}
                        queue={queue}
                        canOperate={canOperate}
                        busyAction={busyAction}
                        onAction={runQueueAction}
                      />
                    ))}
                  </div>
                  {!visibleQueues.length && (
                    <div className="px-6 py-10">
                      <EmptyState
                        title="Tidak ada antrean yang cocok"
                        description={
                          timeWindow !== "today"
                            ? `Tidak ada antrean pada rentang ${timeWindow === "1h" ? "1 jam" : timeWindow === "3h" ? "3 jam" : "8 jam"} terakhir. Pilih "Hari ini" untuk melihat semua antrean hari ini.`
                            : statusFilter === "LIVE"
                              ? "Tidak ada antrean aktif atau menunggu. Pilih \"Semua status\" untuk melihat antrean yang sudah selesai."
                              : "Ubah kata kunci pencarian, filter loket, atau pilih status lain."
                        }
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="px-6 py-10">
                  <EmptyState title="Belum ada antrean hari ini" description="Antrean baru akan tampil di sini setelah nomor diterbitkan." />
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[#eff2f0] px-5 py-3.5 text-xs text-[#929e99] md:px-6">
                <span>
                  Menampilkan {displayedQueues.length} dari {visibleQueues.length} antrean
                  {visibleQueues.length !== queues.length ? ` (total ${queues.length})` : ""}
                </span>
                {visibleQueues.length > VISIBLE_QUEUE_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllQueues((current) => !current)}
                    className="font-medium text-[#176b5b] hover:underline"
                  >
                    {showAllQueues ? "Ringkas" : `Lihat semua (${visibleQueues.length})`}
                  </button>
                )}
              </div>
            </section>

            <div className="space-y-5">
              {analyticsEnabled && (
              <section id="services" className="rounded-2xl border border-[#e9edeb] bg-white p-5 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-[-.02em]">Layanan populer</h2>
                    <p className="mt-1 text-xs text-[#929e99]">Berdasarkan antrean hari ini</p>
                  </div>
                  <details className="relative">
                    <summary
                      aria-label="Bantuan layanan populer"
                      className="cursor-pointer list-none text-[#a3ada9] hover:text-[#75827f] [&::-webkit-details-marker]:hidden"
                    >
                      <CircleHelp className="size-4" />
                    </summary>
                    <div className="absolute right-0 top-6 z-40 w-64 rounded-xl border border-[#e9edeb] bg-white p-3 text-left shadow-[0_12px_32px_rgba(25,48,40,.12)]">
                      <p className="text-[11px] font-semibold text-[#40504a]">Cara membaca</p>
                      <p className="mt-1 text-[11px] leading-5 text-[#889590]">
                        Persentase dihitung dari jumlah antrean hari ini per layanan.
                        Kosong berarti layanan belum menerima antrean.
                      </p>
                      <a
                        href="#reports"
                        className="mt-2 block text-[11px] font-semibold text-[#176b5b] hover:underline"
                      >
                        Lihat laporan lengkap
                      </a>
                    </div>
                  </details>
                </div>
                <div className="mt-5 space-y-4">
                  {branch.services.map((service, index) => {
                    const count = queues.filter((queue) => queue.serviceCode === service.code).length;
                    const percentage = queues.length ? Math.round((count / queues.length) * 100) : 0;
                    return (
                      <div key={service.id}>
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-medium text-[#475550]">{service.name}</span>
                          <span className="text-[#929e99]">{count} antrean</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f3f2]">
                          <div
                            className={`h-full rounded-full ${["bg-[#4c9c80]", "bg-[#89bfa9]", "bg-[#b8d9c9]"][index % 3]}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {!branch.services.length && (
                    <EmptyState title="Belum ada layanan" description="Layanan yang dibuat akan tampil di sini." />
                  )}
                </div>
              </section>
              )}
              {analyticsEnabled && (
              <section id="analytics" className="rounded-2xl bg-[#176b5b] p-5 text-white shadow-[0_8px_20px_rgba(23,107,91,.12)] md:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-white/15">
                    <Sparkles className="size-[17px]" />
                  </div>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-medium text-white/80">
                    {enabledFeatures.includes("ANALYTICS") ? "Analytics aktif" : "Analytics nonaktif"}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">Performa pelayanan</h3>
                <p className="mt-1 text-xs leading-5 text-white/65">
                  Ringkasan layanan berdasarkan data yang tercatat hari ini.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-[10px] text-white/65">Rata-rata waktu tunggu</p>
                    <p className="mt-1 text-xl font-semibold">{metrics.averageWaitMinutes} mnt</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-[10px] text-white/65">Selesai dilayani</p>
                    <p className="mt-1 text-xl font-semibold">{metrics.completed}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-white/60">
                  <Check className="size-3.5" />
                  Berdasarkan aktivitas antrean aktual
                </div>
              </section>
              )}
            </div>
          </div>
          <div className="mt-5 grid gap-5 2xl:grid-cols-2">
            <ServicesManager businessSlug={businessSlug} canConfigure={canConfigure} />
            <CountersManager
              businessSlug={businessSlug}
              branchId={branch.id}
              branchName={branch.name}
              canConfigure={canConfigure}
              services={branch.services}
            />
          </div>
          <div className="mt-5">
            <CustomersManager businessSlug={businessSlug} canManage={canConfigure} />
          </div>
          <div className="mt-5">
            <DisplaysManager
              businessSlug={businessSlug}
              counters={counterOptions}
              canManage={canConfigure}
            />
          </div>
          <div className="mt-5">
            <BranchesManager
              businessSlug={businessSlug}
              canManage={canConfigure}
              currentBranchId={branch.id}
            />
          </div>
          {canManageTeam && (
            <div className="mt-5">
              <TeamManager
                businessSlug={businessSlug}
                branches={branches}
                counters={counterOptions}
                canManage={canManageTeam}
                currentUserId={user.id}
              />
            </div>
          )}
          <div className="mt-5">
            <ReportsManager
              businessSlug={businessSlug}
              branchId={branch.id}
              canView={canManageTeam}
            />
          </div>
          {enabledFeatures.includes("BOOKING") && (
            <div className="mt-5">
              <BookingManagement
                businessSlug={businessSlug}
                timezone={branch.timezone}
                bookings={bookings}
                readOnly={!canOperate}
              />
            </div>
          )}
          {canConfigure && (
            <div className="mt-5 grid gap-5 2xl:grid-cols-2">
              <FeatureSettings
                businessSlug={businessSlug}
                enabledFeatures={enabledFeatures}
              />
              <AccessLinks
                businessSlug={businessSlug}
                branchId={branch.id}
                qrEnabled={enabledFeatures.includes("QR_QUEUE")}
                displayEnabled={enabledFeatures.includes("TV_DISPLAY")}
                bookingEnabled={enabledFeatures.includes("BOOKING")}
              />
            </div>
          )}
          <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-[#e8ecea] py-5 text-[11px] text-[#a0aaa6] sm:flex-row">
            <span>© 2026 Antrian Management System</span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#55ad86]" />
              Data tersimpan dengan aman
              <span className="mx-1">·</span>
              {roleLabel(role)}
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function MobileNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-[#718079] transition hover:bg-[#edf5f1] hover:text-[#176b5b]"
    >
      {label}
    </a>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active = false,
  badge,
  disabled = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${active ? "bg-[#edf5f1] font-semibold text-[#176b5b]" : "text-[#75827f] hover:bg-[#f7f9f8] hover:text-[#344440]"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <Icon className="size-[17px]" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#687570] shadow-sm">
          {badge}
        </span>
      )}
    </a>
  );
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
  tone,
  trend,
}: {
  title: string;
  value: number;
  note: string;
  icon: LucideIcon;
  tone: "green" | "amber" | "blue" | "violet";
  trend: string;
}) {
  const tones = {
    green: "bg-[#eaf5ef] text-[#43886d]",
    amber: "bg-[#fff5e7] text-[#c68a33]",
    blue: "bg-[#edf2fc] text-[#6889c5]",
    violet: "bg-[#f3effb] text-[#8f72be]",
  };
  return (
    <article className="rounded-2xl border border-[#e9edeb] bg-white p-4 shadow-[0_2px_8px_rgba(25,48,40,.025)] md:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#75827f]">{title}</p>
        <span className={`flex size-8 items-center justify-center rounded-[10px] ${tones[tone]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[28px] font-semibold leading-none tracking-[-.04em]">{value}</p>
          <p className="mt-2 text-[11px] text-[#929e99]">{note}</p>
        </div>
        <span className="mb-0.5 flex items-center gap-1 rounded-full bg-[#f3f7f5] px-2 py-1 text-[9px] font-medium text-[#638d7b]">
          {tone === "amber" ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
          {trend}
        </span>
      </div>
    </article>
  );
}

function TinyMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f4f7f5] text-[#6f8c80]">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-[9px] text-[#9aa5a1]">{label}</p>
        <p className="mt-0.5 text-xs font-semibold text-[#41514b]">{value}</p>
      </div>
    </div>
  );
}

function QueueActivityChart({
  queues,
  timezone,
}: {
  queues: QueueRow[];
  timezone: string;
}) {
  const hours = Array.from({ length: 9 }, (_, index) => index + 7);
  const counts = hours.map((hour) =>
    queues.filter((queue) => {
      const localHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(queue.issuedAt)),
      );
      return localHour === hour;
    }).length,
  );
  const max = Math.max(1, ...counts);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-2xl font-semibold tracking-[-.04em]">{queues.length}</span>
        <span className="rounded-full bg-[#eaf5ef] px-2 py-1 text-[10px] font-medium text-[#43886d]">
          <ArrowUpRight className="mr-0.5 inline size-3" /> antrean
        </span>
      </div>
      <div className="relative h-[172px]">
        <div className="absolute inset-0 flex flex-col justify-between pb-6">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-t border-dashed border-[#edf0ef]" />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-6 top-0 flex items-end justify-around gap-2 px-1">
          {counts.map((count, index) => {
            const height = count ? Math.max(12, (count / max) * 128) : 4;
            return (
              <div key={hours[index]} className="flex h-full flex-1 flex-col items-center justify-end">
                {count > 0 && (
                  <span className="mb-1.5 text-[9px] font-medium text-[#78857f]">{count}</span>
                )}
                <div
                  className={`w-full max-w-[34px] rounded-t-[5px] transition-all ${index === 4 ? "bg-[#176b5b]" : count ? "bg-[#9dccb5]" : "bg-[#ecf1ee]"}`}
                  style={{ height: `${height}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-around">
          {hours.map((hour) => (
            <span key={hour} className="flex-1 text-center text-[9px] text-[#a1aca8]">
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function QueueItem({
  queue,
  canOperate,
  busyAction,
  onAction,
}: {
  queue: QueueRow;
  canOperate: boolean;
  busyAction: string | null;
  onAction: (queueId: string, action: string) => Promise<void>;
}) {
  const statusLabel: Record<QueueStatus, string> = {
    WAITING: "Menunggu",
    CALLED: "Dipanggil",
    SERVING: "Dilayani",
    COMPLETED: "Selesai",
    SKIPPED: "Dilewati",
    CANCELLED: "Dibatalkan",
    NO_SHOW: "Tidak hadir",
  };
  const statusStyles: Record<QueueStatus, string> = {
    WAITING: "bg-[#fff6e8] text-[#ae7723]",
    CALLED: "bg-[#edf2fc] text-[#5b78b0]",
    SERVING: "bg-[#e9f5ef] text-[#31795d]",
    COMPLETED: "bg-[#f0f3f2] text-[#74817c]",
    SKIPPED: "bg-[#f7f0e9] text-[#9a7150]",
    CANCELLED: "bg-[#fbefef] text-[#bd6e6e]",
    NO_SHOW: "bg-[#f4effb] text-[#856ca9]",
  };
  const availableActions: Record<QueueStatus, string[]> = {
    WAITING: ["skip", "cancel"],
    CALLED: ["recall", "start", "skip", "no-show", "return-to-waiting", "cancel"],
    SERVING: ["complete"],
    COMPLETED: [],
    SKIPPED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };

  return (
    <article className="flex flex-col gap-3 px-5 py-3.5 transition hover:bg-[#fcfdfc] md:grid md:grid-cols-[1.2fr_1fr_1.1fr_.8fr_1fr] md:items-center md:gap-4 md:px-6">
      <div className="flex items-center justify-between md:justify-start md:gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#edf5f1] text-[10px] font-bold text-[#377861]">
            {shortName(queue.customerName)}
          </div>
          <div>
            <p className="text-xs font-semibold text-[#344440]">{queue.ticketNumber}</p>
            <p className="mt-0.5 text-[10px] text-[#a0aaa6]">{formatTime(queue.issuedAt)}</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-medium md:hidden ${statusStyles[queue.status]}`}>
          {statusLabel[queue.status]}
        </span>
      </div>
      <div className="pl-[46px] text-xs text-[#687570] md:pl-0">{queue.customerName}</div>
      <div className="flex items-center justify-between pl-[46px] md:pl-0">
        <span className="text-xs text-[#687570]">{queue.serviceName}</span>
        <span className={`hidden w-fit rounded-full px-2 py-1 text-[10px] font-medium md:inline-flex ${statusStyles[queue.status]}`}>
          {statusLabel[queue.status]}
        </span>
      </div>
      <div className="pl-[46px] text-[10px] text-[#a0aaa6] md:pl-0">
        {queue.counterName ?? "—"}
      </div>
      <div className="flex items-center gap-1.5 pl-[46px] md:justify-end md:pl-0">
        {canOperate &&
          availableActions[queue.status].slice(0, 2).map((action) => (
            <button
              key={action}
              onClick={() => onAction(queue.id, action)}
              disabled={busyAction === `${action}-${queue.id}`}
              className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold transition disabled:opacity-50 ${action === "complete" || action === "start" ? "bg-[#176b5b] text-white hover:bg-[#125648]" : "bg-[#f4f7f5] text-[#687570] hover:bg-[#eaf0ed]"}`}
            >
              {busyAction === `${action}-${queue.id}`
                ? "..."
                : action === "complete"
                  ? "Selesaikan"
                  : action === "start"
                    ? "Mulai"
                    : queueActionLabels[action]}
            </button>
          ))}
        {canOperate && availableActions[queue.status].length > 2 && (
          <select
            aria-label={`Aksi tambahan untuk ${queue.ticketNumber}`}
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) {
                void onAction(queue.id, event.target.value);
                event.target.value = "";
              }
            }}
            className="max-w-24 rounded-lg border border-[#edf0ef] bg-white px-2 py-1.5 text-[10px] text-[#687570]"
          >
            <option value="">Lainnya</option>
            {availableActions[queue.status].slice(2).map((action) => (
              <option key={action} value={action}>
                {queueActionLabels[action]}
              </option>
            ))}
          </select>
        )}
        {!canOperate && <span className="text-[10px] text-[#a0aaa6]">Read-only</span>}
        {queue.status === "COMPLETED" && <Check className="ml-auto size-4 text-[#4d9b79] md:ml-0" />}
      </div>
    </article>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#e2e9e5] bg-[#fbfcfb] px-4 py-7 text-center">
      <div className="mx-auto flex size-9 items-center justify-center rounded-xl bg-[#eef5f1] text-[#538a73]">
        <Users2 className="size-4" />
      </div>
      <p className="mt-3 text-xs font-semibold text-[#46544f]">{title}</p>
      <p className="mt-1 text-[11px] text-[#98a39f]">{description}</p>
    </div>
  );
}

function roleLabel(role: MembershipRole) {
  const labels: Record<MembershipRole, string> = {
    OWNER: "Owner",
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin Operasional",
  };
  return labels[role];
}
