import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TIMEZONE, isValidTimezone, timezoneOr } from "../src/modules/shared/timezone";

test("zona waktu kosong jatuh ke WIB, bukan null", () => {
  // null/undefined di sini dulu berujung RangeError di toLocaleString dan
  // mematikan halaman cetak antrean.
  assert.equal(timezoneOr(null), DEFAULT_TIMEZONE);
  assert.equal(timezoneOr(undefined), DEFAULT_TIMEZONE);
  assert.equal(timezoneOr("   "), DEFAULT_TIMEZONE);
});

test("zona waktu yang valid dipakai apa adanya", () => {
  assert.equal(timezoneOr("Asia/Makassar"), "Asia/Makassar");
});

test("isValidTimezone menolak nama yang membuat Intl melempar RangeError", () => {
  // Cabang dengan timezone "Mars/Olympus" dulu tersimpan apa adanya, lalu SELURUH
  // alur antrean/booking cabang itu 500 (RangeError: Invalid time zone specified).
  assert.equal(isValidTimezone("Asia/Jakarta"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
  assert.equal(isValidTimezone("Asia/Jakartaa"), false);
  assert.equal(isValidTimezone(""), false);
});