import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ACTIVE_BOOKINGS_PER_DAY,
  bookingLimitViolation,
} from "../src/modules/booking/domain/limits";

test("booking pertama lolos", () => {
  assert.equal(
    bookingLimitViolation({ sameServiceSameDay: 0, activeSameDay: 0, recentNoShows: 0 }),
    null,
  );
});

test("layanan sama di tanggal sama ditolak", () => {
  const violation = bookingLimitViolation({
    sameServiceSameDay: 1,
    activeSameDay: 1,
    recentNoShows: 0,
  });
  assert.equal(violation?.code, "BOOKING_DUPLICATE");
});

test("batas harian per nomor", () => {
  const allowed = bookingLimitViolation({
    sameServiceSameDay: 0,
    activeSameDay: MAX_ACTIVE_BOOKINGS_PER_DAY - 1,
    recentNoShows: 0,
  });
  assert.equal(allowed, null, "masih di bawah batas");

  const blocked = bookingLimitViolation({
    sameServiceSameDay: 0,
    activeSameDay: MAX_ACTIVE_BOOKINGS_PER_DAY,
    recentNoShows: 0,
  });
  assert.equal(blocked?.code, "BOOKING_DAILY_LIMIT");
});

test("sering tidak hadir diblokir lebih dulu", () => {
  const violation = bookingLimitViolation({
    sameServiceSameDay: 0,
    activeSameDay: 0,
    recentNoShows: 2,
  });
  assert.equal(violation?.code, "BOOKING_NO_SHOW_BLOCKED");
  assert.match(violation!.message, /lokasi/);
});
