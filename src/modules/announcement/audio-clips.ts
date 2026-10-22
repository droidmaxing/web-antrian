/**
 * Maps a ticket number + counter name to the ordered list of pre-rendered
 * audio clips that make up the announcement.
 *
 * Pure module (no DOM) so it can be unit tested and reused by the TV display
 * and the operator dashboard. The runtime never synthesises speech; it only
 * plays the clips resolved here from `/audio/id/`.
 */

export const DIGIT_CLIP_IDS = [
  "digit-0",
  "digit-1",
  "digit-2",
  "digit-3",
  "digit-4",
  "digit-5",
  "digit-6",
  "digit-7",
  "digit-8",
  "digit-9",
] as const;

/** Words that exist as clips. Keep in sync with scripts/generate-announcement-audio.py. */
const TOKEN_ALIASES: Record<string, string> = {
  // "nol" is only rendered once, as the digit clip.
  nol: "digit-0",
  // Indonesian says "seratus", but the clip set composes it from satu + ratus.
  seratus: "satu ratus",
  // "se" forms for thousands are not rendered, so keep the fallback readable.
  seribu: "satu ribu",
};
export const WORD_CLIP_IDS = [
  "nomor-antrean",
  "silakan-menuju",
  "loket",
  "counter",
  "ruang",
  "poli",
  "poliklinik",
  "kasir",
  "pembayaran",
  "pendaftaran",
  "farmasi",
  "laboratorium",
  "radiologi",
  "igd",
  "umum",
  "gigi",
  "anak",
  "kandungan",
  "bedah",
  "mata",
  "tht",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
  "belas",
  "puluh",
  "ratus",
] as const;

const WORD_CLIP_SET = new Set<string>(WORD_CLIP_IDS);
const DIGIT_CLIP_SET = new Set<string>(DIGIT_CLIP_IDS);

/** Inline audio for the pause between "nomor antrean A-012" and "silakan menuju". */
export const PAUSE_CLIP_ID = "jeda";

export type AnnouncementClips = {
  clips: string[];
  /** Words dropped because no clip exists — surfaced in the UI, never silent. */
  missing: string[];
};

const NUMBER_WORDS = [
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
  "sepuluh",
  "sebelas",
];

/** Indonesian number words for 0..999; used for numeric counter names like "Loket 103". */
function numberToWords(value: number): string[] {
  if (value < 0 || !Number.isFinite(value)) return [];
  if (value < 12) return [NUMBER_WORDS[value]];
  if (value < 20) return value === 10 ? ["sepuluh"] : [`${NUMBER_WORDS[value - 10]} belas`];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    return [`${NUMBER_WORDS[tens]} puluh`, ...(rest ? [NUMBER_WORDS[rest]] : [])];
  }
  if (value < 200) {
    const rest = value % 100;
    return ["seratus", ...(rest ? numberToWords(rest) : [])];
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    return [`${NUMBER_WORDS[hundreds]} ratus`, ...(rest ? numberToWords(rest) : [])];
  }
  // Four or more digits are read digit by digit, which is what a queue number needs.
  return String(value).split("").map((digit) => NUMBER_WORDS[Number(digit)]);
}

/** Splits "A-012" into ["A", "0", "1", "2"] style tokens, keeping letters apart. */
export function ticketTokens(ticketNumber: string): string[] {
  return ticketNumber
    .trim()
    .toUpperCase()
    .split(/[\s\-_./]+/)
    .flatMap((part) => part.split(""))
    .filter(Boolean);
}

/**
 * Turns a ticket number into clips. Separator-delimited parts that are whole
 * known words are announced as words ("UMUM-001" -> "umum", nol, nol, satu),
 * anything else is spelled character by character.
 */
function ticketClips(ticketNumber: string): { clips: string[]; missing: string[] } {
  const clips: string[] = [];
  const missing: string[] = [];
  const parts = ticketNumber.trim().toUpperCase().split(/[\s\-_./]+/).filter(Boolean);

  for (const part of parts.length ? parts : ticketTokens(ticketNumber)) {
    if (/^\d+$/.test(part)) {
      for (const character of part) {
        const clip = digitClip(character);
        if (clip) clips.push(clip);
        else missing.push(character);
      }
      continue;
    }
    if (part.length > 1 && WORD_CLIP_SET.has(part.toLowerCase())) {
      clips.push(part.toLowerCase());
      continue;
    }
    for (const character of part) {
      const clip = digitClip(character) ?? letterClip(character);
      if (clip) clips.push(clip);
      else missing.push(character);
    }
  }
  return { clips, missing };
}

function digitClip(character: string): string | null {
  const value = Number(character);
  if (!Number.isInteger(value) || value < 0 || value > 9) return null;
  return `digit-${value}`;
}

function letterClip(character: string): string | null {
  const lower = character.toLowerCase();
  if (lower.length !== 1 || lower < "a" || lower > "z") return null;
  return `letter-${lower}`;
}

/** Expands one word into clip ids, following aliases that map to several clips. */
function resolveToken(token: string): { clips: string[]; missing: string[] } {
  const key = token.toLowerCase();
  const alias = TOKEN_ALIASES[key];
  if (alias) {
    return alias
      .split(" ")
      .reduce(
        (acc, part) => {
          const resolved = resolveToken(part);
          acc.clips.push(...resolved.clips);
          acc.missing.push(...resolved.missing);
          return acc;
        },
        { clips: [] as string[], missing: [] as string[] },
      );
  }
  if (WORD_CLIP_SET.has(key) || DIGIT_CLIP_SET.has(key)) {
    return { clips: [key], missing: [] };
  }
  return { clips: [], missing: [key] };
}

function wordClips(word: string): { clips: string[]; missing: string[] } {
  const normalised = word.toLowerCase();

  // "01" / "103" in a counter name is a number, not a digit series, and a
  // zero-padded "01" is read as "satu" — nobody says "nol satu" for Loket 01.
  if (/^\d{1,3}$/.test(normalised)) {
    const clips: string[] = [];
    const missing: string[] = [];
    for (const piece of numberToWords(Number(normalised))) {
      for (const token of piece.split(" ")) {
        const resolved = resolveToken(token);
        clips.push(...resolved.clips);
        missing.push(...resolved.missing);
      }
    }
    return { clips, missing };
  }

  return resolveToken(normalised);
}

/**
 * Builds the clip sequence: "nomor antrean" + ticket spelled out, a short
 * pause, then "silakan menuju <counter>" when the counter is known.
 */
export function buildAnnouncementClips({
  ticketNumber,
  counterName,
}: {
  ticketNumber: string;
  counterName?: string | null;
}): AnnouncementClips {
  const clips: string[] = ["nomor-antrean"];
  const missing: string[] = [];

  const ticket = ticketClips(ticketNumber);
  clips.push(...ticket.clips);
  missing.push(...ticket.missing);

  clips.push(PAUSE_CLIP_ID);

  if (counterName && counterName.trim()) {
    clips.push("silakan-menuju");
    for (const word of counterName.trim().split(/[\s\-_/]+/)) {
      const resolved = wordClips(word);
      clips.push(...resolved.clips);
      missing.push(...resolved.missing);
    }
  } else {
    clips.push("silakan-menuju", "loket", "pendaftaran");
  }

  return { clips, missing };
}

export function clipUrl(clipId: string, basePath = "/audio/id"): string {
  return `${basePath}/${clipId}.mp3`;
}
