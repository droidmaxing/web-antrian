"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Radio, Users, Volume2, VolumeX } from "lucide-react";
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

type DisplayQueue = {
  ticketNumber: string;
  status: string;
  service: string;
  counter: string;
  counterCode: string;
};

type WaitingQueue = {
  ticketNumber: string;
  service: string;
  issuedAt: string;
  ahead: number;
};

type DisplaySnapshot = {
  display: {
    name: string;
    branch: string;
    business: string;
    scope?: "branch" | "counter";
    counterCount?: number;
  };
  queues: DisplayQueue[];
  waiting: WaitingQueue[];
  voiceEnabled: boolean;
  advertisementEnabled: boolean;
  cursor: string;
};

type DisplayEvent = {
  type: string;
  payload: {
    ticketNumber?: string;
    status?: string;
    counterName?: string | null;
    serviceName?: string;
  };
};

export function TvDisplay({
  token,
  snapshot,
}: {
  token: string;
  snapshot: DisplaySnapshot;
}) {
  const [queues, setQueues] = useState(snapshot.queues);
  const [waiting, setWaiting] = useState(snapshot.waiting);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(snapshot.voiceEnabled);
  const [voiceReady, setVoiceReady] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioPlayerStatus>("idle");
  const [lastAnnouncement, setLastAnnouncement] = useState("");
  const ledger = useRef(new AnnouncementLedger());
  const voiceRef = useRef(snapshot.voiceEnabled);
  const playerRef = useRef<AnnouncementAudioPlayer | null>(null);

  useEffect(() => {
    voiceRef.current = voiceEnabled;
  }, [voiceEnabled]);

  /**
   * The SSE event stream only carries the ticket that changed, which is enough
   * for announcements but not for the "menunggu" list. Re-reading the snapshot
   * keeps that list honest without a second event schema.
   */
  const refreshWaiting = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/public/displays/${token}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = (await response.json()) as {
        data: { waiting: WaitingQueue[]; queues: DisplayQueue[] };
      };
      if (result.data?.waiting) setWaiting(result.data.waiting);
    } catch {
      // A dropped poll is self-healing: the next tick or SSE event retries.
    }
  }, [token]);

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

  /**
   * Speaks the queue number from the pre-rendered Indonesian clips. The Web
   * Speech API is only a fallback for a clip that failed to download, so a
   * missing file degrades instead of silencing the lobby.
   */
  const announce = useCallback(async (event: DisplayEvent) => {
    const { ticketNumber, counterName } = event.payload;
    if (!ticketNumber) return;
    if (!voiceRef.current) return;
    const text = buildAnnouncementText({ ticketNumber, counterName });
    setLastAnnouncement(text);

    const player = playerRef.current;
    if (player) {
      const outcome = await player.play(buildAnnouncementClips({ ticketNumber, counterName }));
      if (outcome === "played") return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    const indonesian = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang?.toLowerCase().startsWith("id"));
    if (indonesian) utterance.voice = indonesian;
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    function updateClock() {
      setClock(
        new Intl.DateTimeFormat("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    }
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    // The waiting list changes on queue.issued/queue.called, neither of which
    // carries enough detail to patch locally, so refresh it periodically.
    const waitingTimer = window.setInterval(() => void refreshWaiting(), 15_000);
    const events = new EventSource(
      `/api/v1/public/displays/${token}/events?after=${encodeURIComponent(snapshot.cursor)}`,
    );
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.addEventListener("capabilities", (message) => {
      const capabilities = JSON.parse((message as MessageEvent<string>).data) as {
        voiceEnabled: boolean;
      };
      voiceRef.current = capabilities.voiceEnabled;
      setVoiceEnabled(capabilities.voiceEnabled);
    });
    events.onmessage = (message) => {
      let event: DisplayEvent;
      try {
        event = JSON.parse(message.data) as DisplayEvent;
      } catch {
        return;
      }
      const { ticketNumber, status } = event.payload;
      if (!ticketNumber || !status) return;

      if (["CALLED", "SERVING"].includes(status)) {
        const nextQueue: DisplayQueue = {
          ticketNumber,
          status,
          counter: event.payload.counterName ?? "—",
          counterCode: "",
          service: event.payload.serviceName ?? "Layanan",
        };
        setQueues((current) =>
          [
            nextQueue,
            ...current.filter((queue) => queue.ticketNumber !== nextQueue.ticketNumber),
          ].slice(0, 8),
        );
        // One announcement per event id, even after an SSE reconnect that
        // replays the backlog.
        if (shouldAnnounce(status) && ledger.current.claim(message.lastEventId || `${ticketNumber}:${status}`)) {
          announce(event);
        }
      } else {
        setQueues((current) =>
          current.filter((queue) => queue.ticketNumber !== ticketNumber),
        );
        // A ticket leaving the waiting line changes everyone's position.
        void refreshWaiting();
      }
    };
    return () => {
      window.clearInterval(timer);
      window.clearInterval(waitingTimer);
      events.close();
    };
  }, [announce, refreshWaiting, snapshot.cursor, token]);

  async function enableVoice() {
    const player = playerRef.current;
    if (!player) return;
    const ready = await player.prime();
    setVoiceReady(ready);
  }

  function toggleVoice() {
    if (!voiceEnabled) {
      setVoiceEnabled(true);
      voiceRef.current = true;
      return;
    }
    setVoiceEnabled(false);
    voiceRef.current = false;
    playerRef.current?.stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  const current = queues.filter((queue) => queue.status === "CALLED");
  const serving = queues.filter((queue) => queue.status === "SERVING");
  const needsVoiceUnlock = voiceEnabled && !voiceReady;
  const audioHint =
    audioStatus === "blocked"
      ? "Klik sekali untuk mengizinkan audio pemanggilan."
      : "Browser memerlukan satu ketukan untuk mengizinkan pemanggilan suara.";

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-[#092c27] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4 md:px-10">
        <div>
          <p className="text-xs font-medium text-[#9fd5c4]">{snapshot.display.business}</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">{snapshot.display.branch}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] text-white/75">
            <span className={`size-1.5 rounded-full ${connected ? "bg-[#84e1ab]" : "bg-[#e4ba6e]"}`} />
            {connected ? "Tersambung" : "Menghubungkan"}
          </span>
          <span className="hidden rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/60 sm:inline">
            {snapshot.display.scope === "counter"
              ? `Loket terpilih · ${snapshot.display.counterCount}`
              : "Semua loket"}
          </span>
          <span className="font-mono text-sm tabular-nums text-white/80">{clock}</span>
          <button
            aria-label="Tampilkan fullscreen"
            onClick={() => void document.documentElement.requestFullscreen()}
            className="hidden rounded-lg bg-white/10 p-2 text-white/75 hover:bg-white/15 sm:block"
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </header>

      {needsVoiceUnlock && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0c987]/30 bg-[#f0c987]/10 px-6 py-2.5 md:px-10">
          <p className="text-[11px] text-[#f4dcae]">{audioHint}</p>
          <button
            onClick={() => void enableVoice()}
            className="flex items-center gap-2 rounded-lg bg-[#f0c987] px-3 py-1.5 text-[11px] font-semibold text-[#3d2d15]"
          >
            <Volume2 className="size-3.5" /> Aktifkan suara
          </button>
        </div>
      )}

      <section className="grid flex-1 gap-6 px-6 py-8 md:grid-cols-[1.45fr_.75fr] md:px-10 md:py-10">
        <div className="flex flex-col">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.18em] text-[#a1ccbd]">
              <Radio className="size-4" />
              Nomor dipanggil
            </div>
            <button
              onClick={toggleVoice}
              aria-pressed={voiceEnabled}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-medium text-white/70 hover:bg-white/15"
            >
              {voiceEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {voiceEnabled ? "Suara aktif" : "Suara nonaktif"}
            </button>
          </div>
          {current[0] ? (
            <div className="relative flex min-h-[310px] flex-1 flex-col justify-center overflow-hidden rounded-[28px] bg-[#d6f0e3] px-8 py-8 text-[#123f34] md:px-14">
              <div className="absolute -right-16 -top-28 size-80 rounded-full border border-[#176b5b]/10" />
              <p className="relative text-sm font-medium text-[#52836f]">{current[0].service}</p>
              <p className="relative mt-4 text-[clamp(4rem,13vw,10rem)] font-semibold leading-none tracking-[-.075em]">
                {current[0].ticketNumber}
              </p>
              <div className="relative mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-[#176b5b] px-4 py-2.5 text-sm font-semibold text-white">
                <span className="flex size-6 items-center justify-center rounded-full bg-white/15 text-[10px]">
                  {current[0].counterCode || "→"}
                </span>
                {current[0].counter}
              </div>
              {lastAnnouncement && (
                <p className="relative mt-6 max-w-md text-xs leading-5 text-[#4d7568]">
                  {lastAnnouncement}
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-[310px] flex-1 flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/[.04] text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-[#a1ccbd]">
                <Radio className="size-6" />
              </div>
              <p className="mt-4 text-base font-medium text-white/80">Belum ada panggilan</p>
              <p className="mt-1 text-xs text-white/45">Nomor antrean akan tampil di sini.</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/45">
            <span className="flex items-center gap-1.5">
              <Volume2 className="size-3.5" />
              {voiceEnabled ? "Pemanggilan suara aktif" : "Ikuti informasi nomor di layar"}
            </span>
            <span>{snapshot.display.name}</span>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[.18em] text-[#a1ccbd]">
                Sedang dilayani
              </p>
              <p className="mt-1 text-[10px] text-white/40">Antrean pada loket aktif</p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] text-white/60">
              {serving.length} aktif
            </span>
          </div>
          <div className="space-y-3">
            {serving.map((queue) => (
              <div key={queue.ticketNumber} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.05] p-4">
                <div>
                  <p className="text-lg font-semibold tracking-tight">{queue.ticketNumber}</p>
                  <p className="mt-1 text-[10px] text-white/45">{queue.service}</p>
                </div>
                <span className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-[#d5e7df]">
                  {queue.counter}
                </span>
              </div>
            ))}
            {!serving.length && (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/40">
                Belum ada antrean yang sedang dilayani.
              </div>
            )}
          </div>
          <div className="mb-4 mt-8 flex items-center justify-between text-xs">
            <p className="font-medium text-white/80">Panggilan terbaru</p>
            <span className="text-[10px] text-white/40">Live</span>
          </div>
          <div className="space-y-2">
            {current.slice(1, 5).map((queue) => (
              <div key={queue.ticketNumber} className="flex items-center justify-between rounded-xl bg-white/[.045] px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-[#e0f1e9]">{queue.ticketNumber}</span>
                  <span className="text-[10px] text-white/40">{queue.service}</span>
                </div>
                <span className="text-[10px] text-[#bad8ca]">{queue.counter}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-5 md:px-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.18em] text-[#a1ccbd]">
            <Users className="size-4" />
            Menunggu
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] text-white/60">
            {waiting.length} antrean
          </span>
        </div>
        {waiting.length ? (
          <div className="flex gap-3 overflow-hidden">
            {waiting.slice(0, 8).map((queue) => (
              <div
                key={queue.ticketNumber}
                className="min-w-0 flex-1 rounded-xl bg-white/[.06] px-4 py-3"
              >
                <p className="truncate text-base font-semibold tracking-tight">{queue.ticketNumber}</p>
                <p className="mt-0.5 truncate text-[10px] text-white/40">{queue.service}</p>
                <p className="mt-1 text-[10px] text-[#9fd5c4]">
                  {queue.ahead > 0 ? `${queue.ahead} antrean lagi` : "Berikutnya"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/40">
            Tidak ada antrean yang menunggu.
          </p>
        )}
      </section>
      <footer className="flex items-center justify-between border-t border-white/10 px-6 py-3.5 text-[10px] text-white/35 md:px-10">
        <span>Harap siapkan nomor antrean saat dipanggil</span>
        <span>Antrian · Layanan lebih nyaman</span>
      </footer>
    </main>
  );
}
