/**
 * Pure helpers for queue voice announcements.
 *
 * Kept free of browser/DB APIs so the phrasing and de-duplication rules can be
 * unit tested and shared by the TV display and the operator dashboard.
 */

const DIGIT_WORDS = [
  "nol",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
];

/** "A-012" -> "A, nol satu dua" so text-to-speech does not read "012" as twelve. */
export function spellTicket(ticketNumber: string): string {
  const parts = ticketNumber.trim().split(/[-_\s]+/).filter(Boolean);
  return parts
    .map((part) =>
      part
        .split("")
        .map((character) =>
          /\d/.test(character) ? DIGIT_WORDS[Number(character)] : character.toUpperCase(),
        )
        .join(" "),
    )
    .join(", ");
}

export type AnnouncementInput = {
  ticketNumber: string;
  counterName?: string | null;
  serviceName?: string | null;
};

/**
 * Indonesian announcement sentence: number first, then the counter.
 * The counter is spelled only when known, otherwise the sentence stays valid.
 */
export function buildAnnouncementText({
  ticketNumber,
  counterName,
}: AnnouncementInput): string {
  const ticket = spellTicket(ticketNumber);
  if (counterName) {
    return `Nomor antrean ${ticket}, silakan menuju ${counterName}.`;
  }
  return `Nomor antrean ${ticket}, silakan menuju loket pelayanan.`;
}

/**
 * Deduplicates announcements by event id. A single `AnnouncementLedger` lives
 * for the lifetime of a page so reconnects and repeated SSE payloads never
 * trigger the same call twice.
 */
export class AnnouncementLedger {
  private readonly seen = new Set<string>();
  private readonly limit: number;

  constructor(limit = 200) {
    this.limit = limit;
  }

  /** Returns true when this event has not been handled yet. */
  claim(eventId: string): boolean {
    if (!eventId || this.seen.has(eventId)) return false;
    this.seen.add(eventId);
    if (this.seen.size > this.limit) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  has(eventId: string): boolean {
    return this.seen.has(eventId);
  }

  get size(): number {
    return this.seen.size;
  }
}

/** Statuses that deserve a voice announcement. */
export function shouldAnnounce(status: string | null | undefined): boolean {
  return status === "CALLED";
}
