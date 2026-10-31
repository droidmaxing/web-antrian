/**
 * Workspace branding: a primary colour (surfaces, buttons, navigation) and a
 * secondary colour (highlights, chips, playful accents), plus an optional logo,
 * all stored per business. Every shade the interface uses is derived from those
 * two values so a Super Admin only has to pick two colours.
 */
import type { CSSProperties } from "react";

export type BrandTheme = {
  /** Optional app title: browser tab, and the fallback is the business name. */
  title: string | null;
  primaryColor: string;
  secondaryColor: string;
  logoMimeType: string | null;
  logoData: string | null;
};

export const DEFAULT_PRIMARY_COLOR = "#176b5b";
export const DEFAULT_SECONDARY_COLOR = "#f2a93b";

/** Long enough for a brand name, short enough to stay readable in a tab. */
export const TITLE_MAX_LENGTH = 60;

/** Trims and collapses whitespace; an empty title means "use the fallback". */
export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title ? title.slice(0, TITLE_MAX_LENGTH) : null;
}

export function brandTitle(theme: Pick<BrandTheme, "title">, fallback: string): string {
  return theme.title ?? fallback;
}

export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number];

/** ~400 KB of base64 payload, i.e. a logo of at most 300 KB on disk. */
export const LOGO_MAX_LENGTH = 400_000;

export const PALETTE_STEPS = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;
export type PaletteStep = (typeof PALETTE_STEPS)[number];

/**
 * How far each step is mixed towards white (positive) or black (negative).
 * 50/100/200/700/800 keep the ratios the shipped design was built on; the rest
 * fill the gaps so hard-coded design values could be replaced by tokens.
 */
const STEP_MIX: Record<PaletteStep, number> = {
  "50": 0.94,
  "100": 0.92,
  "200": 0.88,
  "300": 0.8,
  "400": 0.68,
  "500": 0.52,
  "600": 0.32,
  "700": 0,
  "800": -0.16,
  "900": -0.3,
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

export function normalizeHexColor(value: string): string {
  const hex = value.trim().toLowerCase();
  if (!HEX_COLOR.test(hex)) return DEFAULT_PRIMARY_COLOR;
  const expanded =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return expanded;
}

/** Same validation as the primary colour, but falls back to the secondary default. */
export function normalizeSecondaryColor(value: string): string {
  return isHexColor(value) ? normalizeHexColor(value) : DEFAULT_SECONDARY_COLOR;
}

function channels(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex);
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function toHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** `ratio` 0 = keep the colour, 1 = full target colour. */
function mix(hex: string, target: [number, number, number], ratio: number): string {
  const [red, green, blue] = channels(hex);
  return toHex([
    red + (target[0] - red) * ratio,
    green + (target[1] - green) * ratio,
    blue + (target[2] - blue) * ratio,
  ]);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/** Derives the full tint/shade ramp the interface uses from one base colour. */
export function brandPalette(baseColor: string): Record<PaletteStep, string> {
  const base = normalizeHexColor(baseColor);
  const palette = {} as Record<PaletteStep, string>;
  for (const step of PALETTE_STEPS) {
    const ratio = STEP_MIX[step];
    palette[step] =
      ratio === 0 ? base : mix(base, ratio > 0 ? WHITE : BLACK, Math.abs(ratio));
  }
  return palette;
}

/** The `:root` defaults in globals.css; used as the fallback when no theme row exists. */
export const DEFAULT_THEME: BrandTheme = {
  title: null,
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
  logoMimeType: null,
  logoData: null,
};

const FALLBACK_PRIMARY = brandPalette(DEFAULT_PRIMARY_COLOR);
const FALLBACK_SECONDARY = brandPalette(DEFAULT_SECONDARY_COLOR);

/** Keys are `--brand-*` / `--accent-*` names so they can be spread into a React `style` prop. */
export type BrandVars = Record<`--brand-${PaletteStep}` | `--accent-${PaletteStep}`, string>;

/**
 * CSS custom properties to put on the page root; every `brand-*` and `accent-*`
 * utility resolves through them, so one style prop re-skins the whole subtree.
 * React's `CSSProperties` does not model custom properties, hence the cast at
 * the one place that builds them.
 */
export function brandVars(
  theme: Partial<Pick<BrandTheme, "primaryColor" | "secondaryColor">> | null | undefined,
): CSSProperties {
  const ramp = (value: string | undefined, fallback: Record<PaletteStep, string>) =>
    value && isHexColor(value) ? brandPalette(value) : fallback;
  const primary = ramp(theme?.primaryColor, FALLBACK_PRIMARY);
  const secondary = ramp(theme?.secondaryColor, FALLBACK_SECONDARY);
  const vars = {} as BrandVars;
  for (const step of PALETTE_STEPS) {
    vars[`--brand-${step}`] = primary[step];
    vars[`--accent-${step}`] = secondary[step];
  }
  return vars as CSSProperties;
}

export function logoDataUrl(theme: Pick<BrandTheme, "logoMimeType" | "logoData">): string | null {
  if (!theme.logoData || !theme.logoMimeType) return null;
  return `data:${theme.logoMimeType};base64,${theme.logoData}`;
}