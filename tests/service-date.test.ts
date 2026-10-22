import assert from "node:assert/strict";
import test from "node:test";
import { dateForTimezone } from "../src/modules/queue/domain/service-date";

test("service date follows the branch timezone, not UTC", () => {
  // 17:30 UTC is already the next day in Jakarta (UTC+7).
  const lateUtc = new Date("2026-10-21T17:30:00.000Z");
  assert.equal(
    dateForTimezone("Asia/Jakarta", lateUtc).toISOString(),
    "2026-10-22T00:00:00.000Z",
  );
  // Still the same day in UTC, so a UTC business stays on the 21st.
  assert.equal(
    dateForTimezone("UTC", lateUtc).toISOString(),
    "2026-10-21T00:00:00.000Z",
  );
  // Just after midnight in Jakarta is still the previous day in New York.
  const earlyJakarta = new Date("2026-10-21T18:00:00.000Z");
  assert.equal(
    dateForTimezone("America/New_York", earlyJakarta).toISOString(),
    "2026-10-21T00:00:00.000Z",
  );
});

test("service date always points at midnight UTC for a date-only column", () => {
  const value = dateForTimezone("Asia/Jakarta", new Date("2026-10-21T03:00:00.000Z"));
  assert.equal(value.toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(value.getUTCHours(), 0);
  assert.equal(value.getUTCMinutes(), 0);
});
