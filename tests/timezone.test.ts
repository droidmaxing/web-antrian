import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TIMEZONE, timezoneOr } from "../src/modules/shared/timezone";

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