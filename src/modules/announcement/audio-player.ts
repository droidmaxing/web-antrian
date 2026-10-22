"use client";

/**
 * Plays the pre-rendered announcement clips (see `audio-clips.ts`).
 *
 * Browser autoplay policy means the audio channel must be unlocked once by a
 * real user gesture. `prime()` does that silently; after it succeeds every
 * "panggil berikutnya" announces automatically without further clicks.
 *
 * All audio is served from `/audio/id/*.mp3`, so the voice is identical on
 * every device and does not rely on speech engines installed locally.
 */

import type { AnnouncementClips } from "./audio-clips";
import { clipUrl } from "./audio-clips";

export type AudioPlayerStatus =
  | "idle"
  | "priming"
  | "ready"
  | "playing"
  | "blocked"
  | "unsupported";

export type PlayOutcome = "played" | "skipped" | "fallback" | "failed";

const PRELOAD_TIMEOUT_MS = 4000;
const CLIP_TIMEOUT_MS = 6000;

function silentWavDataUrl(): string {
  // 44-byte silent WAV; used to unlock the audio element inside a gesture.
  return "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";
}

export class AnnouncementAudioPlayer {
  private readonly basePath: string;
  private cache = new Map<string, HTMLAudioElement>();
  private queue: string[] = [];
  private playing = false;
  private status: AudioPlayerStatus = "idle";
  private unsubscribe: (() => void) | null = null;

  constructor(basePath = "/audio/id") {
    this.basePath = basePath;
  }

  get currentStatus(): AudioPlayerStatus {
    return this.status;
  }

  onStatusChange(listener: (status: AudioPlayerStatus) => void): () => void {
    this.unsubscribe?.();
    this.listeners.add(listener);
    this.unsubscribe = () => this.listeners.delete(listener);
    return this.unsubscribe;
  }

  private readonly listeners = new Set<(status: AudioPlayerStatus) => void>();

  private setStatus(status: AudioPlayerStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  /**
   * Warms the cache and unlocks playback. Must be called from a user gesture
   * (click/tap) the first time. Returns true when audio is ready to autoplay.
   */
  async prime(clips: AnnouncementClips = { clips: ["nomor-antrean"], missing: [] }): Promise<boolean> {
    if (typeof window === "undefined" || typeof window.Audio === "undefined") {
      this.setStatus("unsupported");
      return false;
    }
    this.setStatus("priming");
    try {
      const probe = new Audio(silentWavDataUrl());
      probe.volume = 0;
      await probe.play();
      probe.pause();
    } catch {
      this.setStatus("blocked");
      return false;
    }
    void this.preload(clips.clips);
    this.setStatus("ready");
    return true;
  }

  /** Downloads and caches clips so the first announcement is not delayed. */
  async preload(clipIds: string[]): Promise<void> {
    await Promise.all(clipIds.map((clipId) => this.load(clipId).catch(() => null)));
  }

  private load(clipId: string): Promise<HTMLAudioElement> {
    const cached = this.cache.get(clipId);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const audio = new Audio(clipUrl(clipId, this.basePath));
      audio.preload = "auto";
      const timer = window.setTimeout(() => reject(new Error(`timeout ${clipId}`)), PRELOAD_TIMEOUT_MS);
      const done = () => {
        window.clearTimeout(timer);
        this.cache.set(clipId, audio);
        resolve(audio);
      };
      audio.addEventListener("canplaythrough", done, { once: true });
      audio.addEventListener("loadeddata", done, { once: true });
      audio.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error(`gagal memuat ${clipId}`));
      }, { once: true });
      audio.load();
    });
  }

  private playClip(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        audio.removeEventListener("ended", finish);
        audio.removeEventListener("error", finish);
        resolve();
      };
      const timer = window.setTimeout(finish, CLIP_TIMEOUT_MS);
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      audio.currentTime = 0;
      void audio.play().catch(finish);
    });
  }

  /**
   * Plays a clip sequence back-to-back. Returns how the announcement was
   * delivered so the caller can surface an honest status in the UI.
   */
  async play(clips: AnnouncementClips): Promise<PlayOutcome> {
    if (typeof window === "undefined" || typeof window.Audio === "undefined") {
      this.setStatus("unsupported");
      return "failed";
    }
    this.queue.push(...clips.clips);
    if (this.playing) return "played";
    this.playing = true;
    this.setStatus("playing");

    let outcome: PlayOutcome = "played";
    try {
      while (this.queue.length) {
        const clipId = this.queue.shift()!;
        let audio: HTMLAudioElement;
        try {
          audio = await this.load(clipId);
        } catch {
          outcome = "fallback";
          continue;
        }
        await this.playClip(audio);
      }
    } finally {
      this.playing = false;
      this.queue = [];
      this.setStatus("ready");
    }
    return outcome;
  }

  /** Stops playback immediately and clears anything queued. */
  stop(): void {
    this.queue = [];
    for (const audio of this.cache.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.playing = false;
    if (this.status !== "unsupported") this.setStatus("ready");
  }

  /** Releases cached audio elements (used when the page unmounts). */
  dispose(): void {
    this.stop();
    this.cache.clear();
    this.listeners.clear();
    this.unsubscribe = null;
  }
}
