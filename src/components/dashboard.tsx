"use client";

import { timezoneOr } from "@/modules/shared/timezone";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Contact2,
  CreditCard,
  Layers,
  LayoutDashboard,
  LogOut,
  MonitorCog,
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
import { Pager, usePaged } from "@/components/pagination";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureKey, MembershipRole, QueueStatus } from "@prisma/client";
import { BrandLogo } from "@/components/brand-logo";
import { capabilitiesFor, roleLabel } from "@/modules/tenancy/access";
import { brandTitle, brandVars, type BrandTheme } from "@/modules/tenancy/brand";
import { greetingFor } from "@/modules/shared/greeting";
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
  theme: BrandTheme;
  branch: BranchData;
  branches: { id: string; name: string }[];
  counters: { id: string; name: string; code: string; branchId: string }[];
  role: MembershipRole;
  user: { id: string; name: string };
  userName: string;
  /** Waktu server (ISO): salam dan tanggal datang dari server agar hidrasi sama. */
  serverNow: string;
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
  theme,
  branch,
  branches,
  counters: counterOptions,
  role,
  user,
  userName,
  serverNow,
  enabledFeatures,
  bookings,
  metrics,
  queues,
}: DashboardProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<"error" | "success">("success");
  // Capabilities come from modules/tenancy/access so the interface cannot drift
  // from what the API's requireRole checks allow.
  const capabilities = capabilitiesFor(role);
  const canOperate = capabilities.operateQueue;
  const canConfigure = capabilities.configureBusiness;
  const canManageTeam = capabilities.manageTeam;
  const canViewReports = capabilities.viewReports;
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
  const paged = usePaged(visibleQueues);
  const displayedQueues = paged.rows ?? [];

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
    <main
      className="min-h-screen bubble-flow text-[#182321]"
      style={brandVars(theme)}
    >
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[250px] flex-col border-r border-transparent bg-white shadow-bubble-sm xl:flex">
        <div className="flex shrink-0 items-center gap-3 border-b border-brand-100 px-4 py-5">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-brand-700 text-white shadow-bubble-lift">
            <BrandLogo theme={theme} />
          </div>
          <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-.04em]">
            {brandTitle(theme, businessName)}
          </span>
        </div>

        {/* The nav list scrolls on its own so the logout button below never
            leaves the viewport on short laptop screens. */}
        <div className="dashboard-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-5">
        <details className="group">
          <summary className="flex w-full cursor-pointer list-none items-center gap-3 bubble-panel p-3 text-left transition [&::-webkit-details-marker]:hidden">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
              <span className="text-xs font-bold">{shortName(businessName)}</span>
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{businessName}</span>
              <span className="mt-0.5 block text-xs text-[#5c6a65]">{branch.name}</span>
            </span>
            <ChevronDown className="size-4 text-[#626966]" />
          </summary>
          <div className="mt-1.5 bubble-card bg-white p-1.5">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-[#5d6b67]">
              Cabang
            </p>
            {branches.map((option) => (
              <a
                key={option.id}
                href={`/dashboard/${businessSlug}?branch=${encodeURIComponent(option.id)}`}
                className={`block rounded-lg px-2 py-1.5 text-xs ${
                  option.id === branch.id
                    ? "bg-brand-50 font-semibold text-brand-700"
                    : "font-medium text-[#56635f] hover:bg-brand-50"
                }`}
              >
                {option.name}
              </a>
            ))}
            {canConfigure && (
              <a
                href="#branches"
                className="mt-1 block rounded-lg border-t border-brand-100 px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
              >
                Kelola cabang
              </a>
            )}
          </div>
        </details>

        <p className="mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-[#5d6b67]">
          Operasional
        </p>
        <nav className="space-y-1">
          <NavLink href="#overview" label="Ringkasan" icon={LayoutDashboard} />
          <NavLink href="#queue" label="Antrean" icon={Users2} badge={metrics.waiting} />
          <NavLink href="#counters" label="Status loket" icon={Radio} />
          {enabledFeatures.includes("BOOKING") && (
            <NavLink href="#bookings" label="Booking" icon={CalendarDays} />
          )}
        </nav>

        <p className="mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-[#5d6b67]">
          Pengelolaan
        </p>
        <nav className="space-y-1">
          <NavLink href="#services-manage" label="Layanan" icon={Layers} />
          <NavLink href="#counters-manage" label="Loket" icon={MonitorCog} />
          <NavLink href="#customers-manage" label="Pelanggan" icon={Contact2} />
          {canConfigure && <NavLink href="#displays-manage" label="Layar TV" icon={Tv} />}
          <NavLink href="#branches" label="Cabang" icon={Building2} />
          {canManageTeam && <NavLink href="#team" label="Tim & akses" icon={Users2} />}
          {canViewReports && <NavLink href="#reports" label="Laporan" icon={BarChart3} />}
        </nav>

        <p className="mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-[.16em] text-[#5d6b67]">
          Bantuan & pengaturan
        </p>
        <nav className="space-y-1">
          {isOwner && (
            <NavLink
              href={`/dashboard/${businessSlug}/langganan`}
              label="Langganan"
              icon={CreditCard}
            />
          )}
          <NavLink
            href={`/dashboard/${businessSlug}/panduan`}
            label="Panduan"
            icon={BookOpen}
          />
          {canConfigure && (
            <NavLink
              href={`/dashboard/${businessSlug}/pengaturan`}
              label="Pengaturan"
              icon={Settings2}
            />
          )}
        </nav>
        </div>

        {/* Pinned footer: always visible, never inside the scroll container. */}
        <div className="shrink-0 border-t border-[#eef1f0] bg-white p-3">
          <div className="flex items-center gap-2.5 px-2 pb-2.5">
            <div className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
              {shortName(userName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{userName}</p>
              <p className="truncate text-[11px] text-[#66736e]">{roleLabel(role)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-3 bubble-panel px-3 py-2.5 text-left text-sm font-medium text-[#4d5a56] transition hover:bg-[#fdf4f2] hover:text-[#b4553f]"
          >
            <LogOut className="size-4" /> Keluar
          </button>
        </div>
      </aside>

      <section className="xl:pl-[250px]">
        <header className="sticky top-0 z-10 border-b border-transparent bg-white/90 shadow-bubble-sm backdrop-blur">
          <div className="flex h-[72px] items-center justify-between gap-3 px-5 md:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-700 text-white xl:hidden">
                <BrandLogo theme={theme} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] text-[#5c6a65]">{businessName}</p>
                <p className="truncate text-sm font-semibold">{branch.name}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="hidden h-9 w-[210px] items-center gap-2 rounded-lg bg-brand-50 px-3 md:flex bubble-btn">
                <Search className="size-4 text-[#5d6b67]" />
                <input
                  ref={searchRef}
                  value={queueQuery}
                  onChange={(event) => setQueueQuery(event.target.value)}
                  placeholder="Cari nomor, pelanggan, layanan..."
                  aria-label="Cari antrean"
                  className="min-w-0 flex-1 bg-transparent text-xs text-[#344440] outline-none placeholder:text-[#5d6b67]"
                />
                {queueQuery && (
                  <button
                    type="button"
                    onClick={() => setQueueQuery("")}
                    aria-label="Hapus pencarian"
                    className="text-[11px] text-[#5d6b67] hover:text-[#687570]"
                  >
                    Reset
                  </button>
                )}
              </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNoticeOpen((current) => !current)}
                aria-expanded={noticeOpen}
                aria-label="Notifikasi operasional"
                className="relative flex size-9 items-center justify-center rounded-lg text-[#53615b] hover:bg-brand-50"
              >
                <Bell className="size-[18px]" />
                {alerts.length > 0 && (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#e47b69]" />
                )}
              </button>
              {noticeOpen && (
                <div className="absolute right-0 top-11 z-40 w-[290px] bubble-card bg-white p-3">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[.1em] text-[#5d6b67]">
                    Notifikasi
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {alerts.length ? (
                      alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="rounded-lg bubble-panel px-2.5 py-2"
                        >
                          <p className="text-[11px] font-medium text-[#344440]">{alert.title}</p>
                          <p className="mt-0.5 text-[11px] text-[#66736e]">{alert.detail}</p>
                        </div>
                      ))
                    ) : (
                      <p className="px-1 py-3 text-[11px] text-[#5d6b67]">
                        Tidak ada notifikasi. Semua operasional normal.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="mx-1 hidden h-9 w-px bg-brand-200 sm:block" />
            <details className="relative">
              <summary
                aria-label={`Menu akun ${userName}`}
                className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-1 py-1 transition hover:bg-brand-50 [&::-webkit-details-marker]:hidden"
              >
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold">{userName}</p>
                  <p className="mt-0.5 text-[11px] text-[#66736e]">
                    {roleLabel(role)}
                  </p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {shortName(userName)}
                </div>
                <ChevronDown className="size-4 text-[#626966]" />
              </summary>
              <div className="absolute right-0 top-12 z-40 w-[230px] bubble-card bg-white p-1.5">
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-semibold">{userName}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[#66736e]">
                    {roleLabel(role)} · {businessName}
                  </p>
                </div>
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
          </div>
          {/* Pencarian selalu tersedia; di layar sempit ia turun ke baris kedua. */}
          <div className="px-5 pb-3 md:hidden">
            <label className="flex h-9 items-center gap-2 rounded-lg bg-brand-50 px-3 bubble-btn">
              <span className="sr-only">Cari antrean</span>
              <Search className="size-4 shrink-0 text-[#5d6b67]" />
              <input
                value={queueQuery}
                onChange={(event) => setQueueQuery(event.target.value)}
                placeholder="Cari nomor, pelanggan, layanan..."
                className="min-w-0 flex-1 bg-transparent text-xs text-[#344440] outline-none placeholder:text-[#5d6b67]"
              />
              {queueQuery && (
                <button
                  type="button"
                  onClick={() => setQueueQuery("")}
                  className="shrink-0 text-[11px] text-[#5d6b67] hover:text-[#687570]"
                >
                  Reset
                </button>
              )}
            </label>
          </div>
        </header>

        <nav
          aria-label="Navigasi dashboard"
          className="dashboard-mobile-nav sticky top-[120px] z-[9] flex gap-1 overflow-x-auto border-b border-transparent bg-white shadow-bubble-sm px-3 py-2 md:top-[72px] xl:hidden"
        >
          <MobileNavLink href="#overview" label="Ringkasan" />
          <MobileNavLink href="#queue" label="Antrean" />
          <MobileNavLink href="#counters" label="Loket" />
          {enabledFeatures.includes("BOOKING") && (
            <MobileNavLink href="#bookings" label="Booking" />
          )}
          <MobileNavLink href="#services-manage" label="Layanan" />
          <MobileNavLink href="#customers-manage" label="Pelanggan" />
          {canConfigure && <MobileNavLink href="#displays-manage" label="Layar TV" />}
          <MobileNavLink href="#branches" label="Cabang" />
          {canManageTeam && <MobileNavLink href="#team" label="Tim" />}
          {canViewReports && <MobileNavLink href="#reports" label="Laporan" />}
          {isOwner && (
            <MobileNavLink href={`/dashboard/${businessSlug}/langganan`} label="Langganan" />
          )}
          <MobileNavLink href={`/dashboard/${businessSlug}/panduan`} label="Panduan" />
          {canConfigure && (
            <MobileNavLink href={`/dashboard/${businessSlug}/pengaturan`} label="Pengaturan" />
          )}
        </nav>

        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-brand-700">
                <span className="size-1.5 rounded-full bg-brand-500" />
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
                      className="cursor-pointer appearance-none rounded-md bg-transparent py-0.5 pr-5 text-xs font-medium text-brand-700 outline-none hover:bg-brand-50"
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
                <span className="text-[#626764]">·</span>
                {new Intl.DateTimeFormat("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: timezoneOr(branch.timezone),
                }).format(new Date(serverNow))}
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-.04em] sm:text-[30px]">
                {greetingFor(timezoneOr(branch.timezone), serverNow)}, {userName.split(" ")[0]}{" "}
                <span aria-hidden="true">👋</span>
              </h1>
              <p className="mt-1.5 text-sm text-[#5c6a65]">
                Pantau operasional dan antrean hari ini.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative flex items-center">
                <span className="sr-only">Rentang waktu antrean</span>
                <CalendarDays className="pointer-events-none absolute left-3 size-4 text-[#5c6a65]" />
                <select
                  value={timeWindow}
                  onChange={(event) => {
                    setTimeWindow(event.target.value as TimeWindow);
                    setWindowAnchor(Date.now());
                  }}
                  className="h-10 cursor-pointer appearance-none rounded-lg bubble-field bg-white pl-9 pr-8 text-xs font-medium text-[#56635f] shadow-bubble-sm outline-none"
                >
                  <option value="today">Hari ini</option>
                  <option value="1h">1 jam terakhir</option>
                  <option value="3h">3 jam terakhir</option>
                  <option value="8h">8 jam terakhir</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#5d6b67]" />
              </label>
              {canOperate && (
                <a
                  href="#queue"
                  className="flex h-10 items-center gap-2 rounded-full bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-bubble-sm transition hover:bg-brand-800"
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
                className="rounded-lg p-2 text-[#5c6a65] hover:bg-white"
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
              tone="brand"
            />
            <MetricCard
              title="Menunggu"
              value={metrics.waiting}
              note="pelanggan dalam antrean"
              icon={Clock3}
              tone="accent"
            />
            <MetricCard
              title="Sedang dilayani"
              value={metrics.active}
              note="antrean di loket"
              icon={Activity}
              tone="brandSoft"
            />
            <MetricCard
              title="Selesai"
              value={metrics.completed}
              note="pelayanan dituntaskan"
              icon={CheckCheck}
              tone="accentSoft"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.9fr)]">
            <section
              id="overview"
              className="bubble-card p-5 shadow-bubble-sm md:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-.02em]">
                    Aktivitas antrean
                  </h2>
                  <p className="mt-1 text-xs text-[#66736e]">
                    Distribusi tiket berdasarkan rentang waktu di atas
                  </p>
                </div>
              </div>
              {analyticsEnabled ? (
                <>
                  <QueueActivityChart
                    queues={queuesInWindow}
                    timezone={timezoneOr(branch.timezone)}
                    nowIso={serverNow}
                  />
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-brand-100 pt-4 sm:grid-cols-4">
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

            <section id="counters" className="bubble-card p-5 shadow-bubble-sm md:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-.02em]">
                    Status loket
                  </h2>
                  <p className="mt-1 text-xs text-[#66736e]">
                    Kondisi pelayanan saat ini
                  </p>
                </div>
              </div>
              {voiceEnabled && canOperate && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 bubble-panel bg-brand-50 px-3 py-2.5">
                  <p className="flex min-w-0 items-center gap-2 text-[11px] text-[#6c7a74]">
                    <Volume2 className="size-3.5 shrink-0 text-brand-600" />
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
                    className="shrink-0 rounded-lg bubble-card bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    {!voiceReady ? "Aktifkan suara" : voiceMuted ? "Nyalakan suara" : "Matikan suara"}
                  </button>
                </div>
              )}
              <div className="mt-5 space-y-3">
                {branch.counters.map((counter) => (
                  <div
                    key={counter.id}
                    className="flex items-center gap-3 bubble-panel p-3"
                  >
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${counter.currentTicket ? "bg-brand-100 text-brand-700" : "bg-[#f2f4f3] text-[#5f6965]"}`}>
                      {counter.code}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{counter.name}</p>
                        <span className={`size-1.5 rounded-full ${counter.currentTicket ? "bg-brand-500" : "bg-[#c9d0cd]"}`} />
                      </div>
                      <p className="mt-1 truncate text-xs text-[#66736e]">
                        {counter.currentTicket
                          ? `${counter.currentTicket} · ${counter.currentService}`
                          : "Belum ada pelanggan"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[11px] font-medium ${counter.currentTicket ? "text-brand-700" : "text-[#5d6b67]"}`}>
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
                          className="mt-1 text-[11px] font-semibold text-brand-700 hover:underline disabled:opacity-40"
                        >
                          {busyAction === `call-${counter.id}`
                            ? "Memanggil..."
                            : counter.waitingForCounter === 0
                              ? "Tidak ada antrean"
                              : `Panggil berikutnya · ${counter.waitingForCounter}`}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!branch.counters.length && (
                  <EmptyState title="Belum ada loket" description="Tambahkan loket untuk mulai melayani antrean." />
                )}
              </div>
              <a href="#counters-manage" className="mt-4 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold text-[#596661] hover:bg-brand-50 bubble-btn">
                Kelola semua loket <ArrowUpRight className="size-3.5" />
              </a>
            </section>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.9fr)]">
            <section id="queue" className="overflow-hidden bubble-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 px-5 py-5 md:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold tracking-[-.02em]">Antrean hari ini</h2>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
                      {queues.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#66736e]">Pantau dan kelola setiap pelanggan</p>
                </div>
                  <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => router.refresh()}
                    className="flex size-9 items-center justify-center rounded-lg text-[#606965] hover:bg-brand-50 bubble-btn"
                    aria-label="Muat ulang antrean"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                  <label className="relative flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-[#687570] bubble-btn">
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
                  <label className="relative flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-[#687570] bubble-btn">
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
                  <div className="hidden grid-cols-[1.2fr_1fr_1.1fr_.8fr_1fr] gap-4 bg-brand-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-[.1em] text-[#5d6b67] md:grid">
                    <span>Nomor antrean</span>
                    <span>Pelanggan</span>
                    <span>Layanan</span>
                    <span>Status</span>
                    <span className="text-right">Aksi</span>
                  </div>
                  <div className="divide-y divide-brand-100">
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
              <div className="px-5 md:px-6">
                <Pager
                  total={paged.total}
                  page={paged.page}
                  pageCount={paged.pageCount}
                  pageSize={paged.pageSize}
                  unit="antrean"
                  onPage={paged.setPage}
                  onPageSize={paged.setPageSize}
                />
              </div>
            </section>

            <div className="space-y-5">
              {analyticsEnabled && (
              <section id="services" className="bubble-card p-5 shadow-bubble-sm md:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-[-.02em]">Layanan populer</h2>
                    <p className="mt-1 text-xs text-[#66736e]">Berdasarkan antrean hari ini</p>
                  </div>
                  <details className="relative">
                    <summary
                      aria-label="Bantuan layanan populer"
                      className="cursor-pointer list-none text-[#636a67] hover:text-[#53615b] [&::-webkit-details-marker]:hidden"
                    >
                      <CircleHelp className="size-4" />
                    </summary>
                    <div className="absolute right-0 top-6 z-40 w-64 bubble-card bg-white p-3 text-left">
                      <p className="text-[11px] font-semibold text-brand-800">Cara membaca</p>
                      <p className="mt-1 text-[11px] leading-5 text-[#5c6a65]">
                        Persentase dihitung dari jumlah antrean hari ini per layanan.
                        Kosong berarti layanan belum menerima antrean.
                      </p>
                      <a
                        href="#reports"
                        className="mt-2 block text-[11px] font-semibold text-brand-700 hover:underline"
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
                          <span className="text-[#66736e]">{count} antrean</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-brand-50">
                          <div
                            className={`h-full rounded-full ${["bg-brand-500", "bg-brand-400", "bg-brand-300"][index % 3]}`}
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
              <section id="analytics" className="rounded-bubble bg-brand-700 p-5 text-white shadow-bubble-lift md:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-white/15">
                    <Sparkles className="size-[17px]" />
                  </div>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/80">
                    {enabledFeatures.includes("ANALYTICS") ? "Analytics aktif" : "Analytics nonaktif"}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">Performa pelayanan</h3>
                <p className="mt-1 text-xs leading-5 text-white/65">
                  Ringkasan layanan berdasarkan data yang tercatat hari ini.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-[11px] text-white/65">Rata-rata waktu tunggu</p>
                    <p className="mt-1 text-xl font-semibold">{metrics.averageWaitMinutes} mnt</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-[11px] text-white/65">Selesai dilayani</p>
                    <p className="mt-1 text-xl font-semibold">{metrics.completed}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-white/60">
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
          {canConfigure && (
            <div className="mt-5">
              <DisplaysManager
                businessSlug={businessSlug}
                counters={counterOptions}
                canManage={canConfigure}
              />
            </div>
          )}
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
          {canViewReports && (
            <div className="mt-5">
              <ReportsManager
                businessSlug={businessSlug}
                branchId={branch.id}
                canView={canManageTeam}
              />
            </div>
          )}
          {enabledFeatures.includes("BOOKING") && (
            <div className="mt-5">
              <BookingManagement
                businessSlug={businessSlug}
                timezone={timezoneOr(branch.timezone)}
                bookings={bookings}
                readOnly={!canOperate}
              />
            </div>
          )}
          {canConfigure && (
            <a
              href={`/dashboard/${businessSlug}/pengaturan`}
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-brand-700 hover:underline"
            >
              <Settings2 className="size-4" /> Pengaturan workspace
            </a>
          )}
          <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-[#e8ecea] py-5 text-[11px] text-[#5d6b67] sm:flex-row">
            <span>
              © {serverNow.slice(0, 4)} {brandTitle(theme, businessName)}
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-brand-500" />
              Data tersimpan dengan aman
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
      className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-[#718079] transition hover:bg-brand-50 hover:text-brand-700"
    >
      {label}
    </a>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-[#53615b] transition hover:bg-brand-50 hover:text-[#344440]"
    >
      <Icon className="size-[17px]" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#687570] shadow-bubble-sm">
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
}: {
  title: string;
  value: number;
  note: string;
  icon: LucideIcon;
  tone: "brand" | "accent" | "brandSoft" | "accentSoft";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    accent: "bg-accent-100 text-accent-800",
    brandSoft: "bg-brand-100 text-brand-700",
    accentSoft: "bg-accent-200 text-accent-900",
  };
  return (
    <article className="bubble-card p-4 shadow-bubble-sm md:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#53615b]">{title}</p>
        <span className={`flex size-8 items-center justify-center rounded-[10px] ${tones[tone]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3">
        <p className="text-[28px] font-semibold leading-none tracking-[-.04em]">{value}</p>
        <p className="mt-2 text-[11px] text-[#66736e]">{note}</p>
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
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[#6f8c80]">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-[9px] text-[#5d6b67]">{label}</p>
        <p className="mt-0.5 text-xs font-semibold text-brand-800">{value}</p>
      </div>
    </div>
  );
}

function QueueActivityChart({
  queues,
  timezone,
  nowIso,
}: {
  queues: QueueRow[];
  timezone: string;
  nowIso: string;
}) {
  const hours = Array.from({ length: 9 }, (_, index) => index + 7);
  const localHour = (value: string) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value)),
    );
  const counts = hours.map(
    (hour) => queues.filter((queue) => localHour(queue.issuedAt) === hour).length,
  );
  const currentHour = localHour(nowIso);
  const max = Math.max(1, ...counts);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-2xl font-semibold tracking-[-.04em]">{queues.length}</span>
        <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-600">
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
                  className={`w-full max-w-[34px] rounded-t-[5px] transition-all ${hours[index] === currentHour ? "bg-brand-700" : count ? "bg-brand-400" : "bg-brand-100"}`}
                  style={{ height: `${height}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-around">
          {hours.map((hour) => (
            <span key={hour} className="flex-1 text-center text-[9px] text-[#5d6b67]">
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
    WAITING: "bg-accent-100 text-accent-900",
    CALLED: "bg-[#edf2fc] text-[#5b78b0]",
    SERVING: "bg-brand-100 text-brand-700",
    COMPLETED: "bg-brand-50 text-[#74817c]",
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
    <article className="flex flex-col gap-3 px-5 py-3.5 transition hover:bg-brand-50 md:grid md:grid-cols-[1.2fr_1fr_1.1fr_.8fr_1fr] md:items-center md:gap-4 md:px-6">
      <div className="flex items-center justify-between md:justify-start md:gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-brand-50 text-[11px] font-bold text-brand-700">
            {shortName(queue.customerName)}
          </div>
          <div>
            <p className="text-xs font-semibold text-[#344440]">{queue.ticketNumber}</p>
            <p className="mt-0.5 text-[11px] text-[#5d6b67]">{formatTime(queue.issuedAt)}</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-medium md:hidden ${statusStyles[queue.status]}`}>
          {statusLabel[queue.status]}
        </span>
      </div>
      <div className="pl-[46px] text-xs text-[#687570] md:pl-0">{queue.customerName}</div>
      <div className="flex items-center justify-between pl-[46px] md:pl-0">
        <span className="text-xs text-[#687570]">{queue.serviceName}</span>
        <span className={`hidden w-fit rounded-full px-2 py-1 text-[11px] font-medium md:inline-flex ${statusStyles[queue.status]}`}>
          {statusLabel[queue.status]}
        </span>
      </div>
      <div className="pl-[46px] text-[11px] text-[#5d6b67] md:pl-0">
        {queue.counterName ?? "—"}
      </div>
      <div className="flex items-center gap-1.5 pl-[46px] md:justify-end md:pl-0">
        {canOperate &&
          availableActions[queue.status].slice(0, 2).map((action) => (
            <button
              key={action}
              onClick={() => onAction(queue.id, action)}
              disabled={busyAction === `${action}-${queue.id}`}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${action === "complete" || action === "start" ? "bg-brand-700 text-white hover:bg-brand-800" : "bg-brand-50 text-[#687570] hover:bg-brand-100"}`}
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
            className="max-w-24 rounded-lg bg-white px-2 py-1.5 text-[11px] text-[#687570] bubble-btn"
          >
            <option value="">Lainnya</option>
            {availableActions[queue.status].slice(2).map((action) => (
              <option key={action} value={action}>
                {queueActionLabels[action]}
              </option>
            ))}
          </select>
        )}
        {!canOperate && <span className="text-[11px] text-[#5d6b67]">Read-only</span>}
        {queue.status === "COMPLETED" && <Check className="ml-auto size-4 text-brand-500 md:ml-0" />}
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
    <div className="rounded-xl bg-brand-50 px-4 py-7 text-center bubble-panel">
      <div className="mx-auto flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Users2 className="size-4" />
      </div>
      <p className="mt-3 text-xs font-semibold text-[#46544f]">{title}</p>
      <p className="mt-1 text-[11px] text-[#5d6b67]">{description}</p>
    </div>
  );
}
