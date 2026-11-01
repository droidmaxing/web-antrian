import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regresi tata letak HP (terukur 2026-11-01 di 360/380/414/430 px):
 * - nav seluler pernah `sticky top-[120px]` sementara header 73 px → celah 47 px
 *   yang tampak "menggantung" di bawah header.
 * - AppHeader (pengaturan/panduan/langganan) membungkus barisnya (3 baris, 130 px).
 * Tinggi header = h-[72px] + border-b 1px; offset sticky harus memakai angka
 * yang sama dengan h-[72px] agar tidak ada celah.
 */
const read = (relative: string) => readFileSync(join(import.meta.dirname, "..", relative), "utf8");

test("nav HP dashboard menempel tepat di bawah header (tanpa celah)", () => {
  const source = read("src/components/dashboard.tsx");

  const headerHeight = source.match(/h-\[(\d+)px\] items-center justify-between/);
  assert.ok(headerHeight, "tinggi header dashboard (h-[Npx]) tidak ditemukan");

  const navTop = source.match(/dashboard-mobile-nav sticky top-\[(\d+)px\]/);
  assert.ok(navTop, "offset sticky nav seluler (top-[Npx]) tidak ditemukan");

  assert.equal(navTop[1], headerHeight[1], "offset sticky nav harus sama dengan tinggi header");
  assert.ok(!/dashboard-mobile-nav[^"]*md:top-/.test(source), "offset nav tidak boleh lagi berubah di md: (satu nilai untuk semua lebar)");
});

test("AppHeader menaruh navigasi di barisnya sendiri, bukan membungkus 3 baris", () => {
  const source = read("src/components/app-header.tsx");
  const nav = source.match(/<nav\s+aria-label="Navigasi workspace"\s+className="([^"]+)"/);
  assert.ok(nav, "nav AppHeader tidak ditemukan");

  const classes = nav[1];
  assert.ok(classes.includes("order-last"), "nav harus di akhir urutan di HP");
  assert.ok(classes.includes("w-full"), "nav harus selebar barisnya sendiri di HP");
  assert.ok(classes.includes("md:order-none") && classes.includes("md:w-auto"), "di layar lebar nav kembali sebaris");
});
