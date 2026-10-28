/**
 * Workspace branding: one primary colour plus an optional logo, both stored per
 * business. Everything else (background tints, hover shades) is derived from the
 * primary colour so a Super Admin only has to pick one value.
 */
import type { CSSProperties } from "react";

export type BrandTheme = {
  /** Optional app title: browser tab, and the fallback is the business name. */
  title: string | null;
  primaryColor: string;
  logoMimeType: string | null;
  logoData: string | null;
};

export const DEFAULT_PRIMARY_COLOR = "#176b5b";

export const DEFAULT_THEME: BrandTheme = {
  title: null,
  primaryColor: DEFAULT_PRIMARY_COLOR,
  logoMimeType: null,
  logoData: null,
};

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

export const PALETTE_STEPS = ["50", "100", "200", "700", "800"] as const;
export type PaletteStep = (typeof PALETTE_STEPS)[number];

/** The `:root` defaults in globals.css; used as the fallback when no theme row exists. */
const FALLBACK_PALETTE: Record<PaletteStep, string> = {
  "50": "#edf5f1",
  "100": "#eef5f2",
  "200": "#e5f2ee",
  "700": "#176b5b",
  "800": "#125648",
};

/** Keys are `--brand-*` names so they can be spread into a React `style` prop. */
export type BrandVars = Record<`--brand-${PaletteStep}`, string>;

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

/**
 * Derives the shades the interface uses from a single primary colour. Ratios are
 * tuned so the default `#176b5b` lands on the palette the design already ships.
 */
export function brandPalette(primaryColor: string): Record<PaletteStep, string> {
  if (!isHexColor(primaryColor)) return { ...FALLBACK_PALETTE };
  return {
    "50": mix(primaryColor, WHITE, 0.94),
    "100": mix(primaryColor, WHITE, 0.92),
    "200": mix(primaryColor, WHITE, 0.88),
    "700": normalizeHexColor(primaryColor),
    "800": mix(primaryColor, BLACK, 0.16),
  };
}

/**
 * CSS custom properties to put on the page root; falls back to the shipped
 * palette. React's `CSSProperties` does not model custom properties, hence the
 * cast at the one place that builds them.
 */
export function brandVars(primaryColor: string | null | undefined): CSSProperties {
  const palette = primaryColor ? brandPalette(primaryColor) : { ...FALLBACK_PALETTE };
  return {
    "--brand-50": palette["50"],
    "--brand-100": palette["100"],
    "--brand-200": palette["200"],
    "--brand-700": palette["700"],
    "--brand-800": palette["800"],
  } satisfies BrandVars as CSSProperties;
}

export function logoDataUrl(theme: Pick<BrandTheme, "logoMimeType" | "logoData">): string | null {
  if (!theme.logoData || !theme.logoMimeType) return null;
  return `data:${theme.logoMimeType};base64,${theme.logoData}`;
}
