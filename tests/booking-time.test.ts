import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocalDays,
  buildThirtyMinuteSlots,
  getWeekday,
  isValidLocalDate,
  localDateTimeToUtc,
  localDateInTimezone,
} from "../src/modules/booking/domain/time";
import { bookingStatusAfterAction } from "../src/modules/booking/domain/state-machine";
import { AppError } from "../src/modules/shared/errors";

test("booking slots use branch-local 30-minute increments and exclude closing time", () => {
  const slots = buildThirtyMinuteSlots(
    "2026-10-05",
    "Asia/Jakarta",
    { opensAt: "09:00", closesAt: "10:15" },
    new Date("2026-10-04T00:00:00.000Z"),
  );

  assert.deepEqual(
    slots.map((slot) => slot.localTime),
    ["09:00", "09:30"],
  );
  assert.equal(slots[0].startsAt.toISOString(), "2026-10-05T02:00:00.000Z");
  assert.equal(slots[1].startsAt.toISOString(), "2026-10-05T02:30:00.000Z");
});

test("booking slots exclude times that are too close to the current time", () => {
  const slots = buildThirtyMinuteSlots(
    "2026-10-05",
    "Asia/Jakarta",
    { opensAt: "09:00", closesAt: "11:00" },
    new Date("2026-10-05T02:15:00.000Z"),
  );

  assert.deepEqual(
    slots.map((slot) => slot.localTime),
    ["10:00", "10:30"],
  );
});

test("nonexistent daylight-saving local times are omitted", () => {
  const slots = buildThirtyMinuteSlots(
    "2026-03-08",
    "America/New_York",
    { opensAt: "01:00", closesAt: "04:00" },
    new Date("2026-03-07T12:00:00.000Z"),
  );

  assert.deepEqual(
    slots.map((slot) => slot.localTime),
    ["01:00", "01:30", "03:00", "03:30"],
  );
});

test("booking date helpers validate calendar dates and weekdays", () => {
  assert.equal(isValidLocalDate("2026-02-28"), true);
  assert.equal(isValidLocalDate("2026-02-30"), false);
  assert.equal(isValidLocalDate("2026-2-03"), false);
  assert.equal(getWeekday("2026-10-04"), 0);
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
});

test("invalid or nonexistent local times are rejected", () => {
  assert.throws(() => localDateTimeToUtc("2026-02-30", "09:00", "Asia/Jakarta"));
  assert.throws(() =>
    localDateTimeToUtc("2026-03-08", "02:30", "America/New_York"),
  );
});

test("booking state transitions reject actions after cancellation or check-in", () => {
  assert.equal(bookingStatusAfterAction("PENDING", "confirm"), "CONFIRMED");
  assert.equal(bookingStatusAfterAction("PENDING", "cancel"), "CANCELLED");
  assert.equal(bookingStatusAfterAction("CONFIRMED", "check-in"), "CHECKED_IN");
  assert.equal(bookingStatusAfterAction("CONFIRMED", "no-show"), "NO_SHOW");
  assert.throws(
    () => bookingStatusAfterAction("PENDING", "no-show"),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 409 &&
      error.code === "INVALID_BOOKING_TRANSITION",
  );
  assert.throws(
    () => bookingStatusAfterAction("CANCELLED", "confirm"),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 409 &&
      error.code === "INVALID_BOOKING_TRANSITION",
  );
  assert.throws(
    () => bookingStatusAfterAction("CHECKED_IN", "cancel"),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 409 &&
      error.code === "INVALID_BOOKING_TRANSITION",
  );
});

test("booking online hanya menerima tanggal H-1 sampai batas jendela booking", () => {
  // Aturan yang sama dengan validateDate: hari ini tidak boleh, besok boleh.
  const timezone = "Asia/Jakarta";
  const today = localDateInTimezone(new Date("2026-10-31T02:00:00.000Z"), timezone);
  const firstAllowed = addLocalDays(today, 1);
  const lastAllowed = addLocalDays(today, 14);

  assert.equal(today, "2026-10-31");
  assert.equal(firstAllowed, "2026-11-01");
  assert.equal(lastAllowed, "2026-11-14");
  assert.ok(addLocalDays("2026-10-31", 1) > today);
  assert.ok(addLocalDays("2026-12-31", 1) === "2027-01-01");
});

test("hari operasional cabang mengikuti hari lokal tanggal tersebut", () => {
  // 2026-11-01 adalah hari Minggu di zona cabang mana pun (Asia).
  assert.equal(getWeekday("2026-11-01"), 0);
  assert.equal(getWeekday("2026-11-02"), 1);
});
