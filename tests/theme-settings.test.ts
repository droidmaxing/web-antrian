import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRIMARY_COLOR,
  LOGO_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  brandPalette,
  brandTitle,
  brandVars,
  isHexColor,
  normalizeHexColor,
  normalizeTitle,
} from "../src/modules/tenancy/brand";

// prisma.ts reads DATABASE_URL when the module loads; the theme-service helpers
// below never touch the database, so a placeholder keeps the import safe. The
// imports stay dynamic so the variable is set first (tsx compiles to CommonJS).
async function themeService() {
  process.env.DATABASE_URL ??=
    "mysql://placeholder:placeholder@127.0.0.1:3306/placeholder";
  const [{ parseLogoUpload }, { AppError }] = await Promise.all([
    import("../src/modules/tenancy/theme-service"),
    import("../src/modules/shared/errors"),
  ]);
  return { parseLogoUpload, AppError };
}

const png = (extra = "") =>
  `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64")}${extra}`;
const jpeg = () =>
  `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`;
const webp = () =>
  `data:image/webp;base64,${Buffer.from("RIFF0000WEBPVP8 ").toString("base64")}`;

test("the primary colour is validated and expanded", () => {
  assert.equal(isHexColor("#176b5b"), true);
  assert.equal(isHexColor("#176B5B"), true);
  assert.equal(isHexColor("176b5b"), false);
  assert.equal(isHexColor("#176b5"), false);
  assert.equal(isHexColor("#176b5bz"), false);
  assert.equal(normalizeHexColor(" #ABC "), "#aabbcc");
  assert.equal(normalizeHexColor("red"), DEFAULT_PRIMARY_COLOR);
  assert.equal(normalizeHexColor("#176b5b"), "#176b5b");
});

test("every brand shade is derived and emitted as a CSS variable", () => {
  const palette = brandPalette("#1d5f9c");
  for (const value of Object.values(palette)) assert.ok(isHexColor(value), value);
  // 50/100/200 are tints, 700/800 shades of the same hue.
  assert.ok(palette["50"].localeCompare(palette["700"]) > 0);
  const vars = (primaryColor: string | null) =>
    brandVars(primaryColor) as unknown as Record<string, string>;
  assert.deepEqual(Object.keys(vars("#1d5f9c")), [
    "--brand-50",
    "--brand-100",
    "--brand-200",
    "--brand-700",
    "--brand-800",
  ]);
  assert.equal(vars(null)["--brand-700"], DEFAULT_PRIMARY_COLOR);
  assert.equal(vars("nonsense")["--brand-700"], DEFAULT_PRIMARY_COLOR);
});

test("the app title is trimmed, collapsed, capped, and falls back to the business name", () => {
  assert.equal(normalizeTitle("  Warung   Kopi  "), "Warung Kopi");
  assert.equal(normalizeTitle("   "), null);
  assert.equal(normalizeTitle(null), null);
  assert.equal(normalizeTitle(42), null);
  assert.equal(normalizeTitle("x".repeat(200))?.length, TITLE_MAX_LENGTH);
  assert.equal(brandTitle({ title: null }, "Nama Bisnis"), "Nama Bisnis");
  assert.equal(brandTitle({ title: "Warung Kopi" }, "Nama Bisnis"), "Warung Kopi");
});

test("the logo upload accepts PNG, JPEG, and WebP data URLs", async () => {
  const { parseLogoUpload } = await themeService();
  assert.deepEqual(parseLogoUpload(png()), { mimeType: "image/png", data: png().split(",")[1] });
  assert.equal(parseLogoUpload(jpeg()).mimeType, "image/jpeg");
  assert.equal(parseLogoUpload(webp()).mimeType, "image/webp");
});

test("the logo upload rejects the wrong type, size, and content", async () => {
  const { parseLogoUpload, AppError } = await themeService();
  const rejects = (value: unknown, code: string) => {
    assert.throws(
      () => parseLogoUpload(value),
      (error: unknown) => error instanceof AppError && error.code === code,
      `expected ${code}`,
    );
  };
  rejects(undefined, "INVALID_LOGO");
  rejects("not-a-data-url", "INVALID_LOGO");
  rejects("data:image/gif;base64,R0lGODlh", "INVALID_LOGO");
  rejects("data:image/png;base64,", "INVALID_LOGO");
  // Declared PNG, JPEG bytes inside.
  rejects(`data:image/png;base64,${jpeg().split(",")[1]}`, "INVALID_LOGO");
  // RIFF container that is not a WEBP image.
  rejects(
    `data:image/webp;base64,${Buffer.from("RIFF0000WAVEfmt ").toString("base64")}`,
    "INVALID_LOGO",
  );
  rejects(png("A".repeat(LOGO_MAX_LENGTH)), "LOGO_TOO_LARGE");
});
