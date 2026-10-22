import assert from "node:assert/strict";
import test from "node:test";
import {
  compareQueuesForAttention,
  isLiveQueueStatus,
  LIVE_QUEUE_STATUSES,
} from "../src/modules/queue/domain/queue-order";

/**
 * Regresi untuk keluhan "tiket selesai & dibatalkan masih muncul di deretan
 * awal". Urutan harus menaruh antrean yang masih hidup di atas tiket lama.
 */
test("queues needing attention sort above finished tickets", () => {
  const rows = [
    { status: "COMPLETED", issuedAt: new Date("2026-10-21T09:00:00Z") },
    { status: "WAITING", issuedAt: new Date("2026-10-21T08:00:00Z") },
    { status: "CANCELLED", issuedAt: new Date("2026-10-21T07:00:00Z") },
    { status: "SERVING", issuedAt: new Date("2026-10-21T06:00:00Z") },
    { status: "SKIPPED", issuedAt: new Date("2026-10-21T05:00:00Z") },
    { status: "CALLED", issuedAt: new Date("2026-10-21T04:00:00Z") },
  ] as const;

  const sorted = [...rows].sort(compareQueuesForAttention);
  assert.deepEqual(
    sorted.map((row) => row.status),
    ["SERVING", "CALLED", "WAITING", "SKIPPED", "CANCELLED", "COMPLETED"],
  );
});

test("live group is oldest first and the finished group is newest first", () => {
  const queues = [
    { status: "WAITING", issuedAt: new Date("2026-10-21T08:30:00Z") },
    { status: "WAITING", issuedAt: new Date("2026-10-21T08:00:00Z") },
    { status: "COMPLETED", issuedAt: new Date("2026-10-21T07:00:00Z") },
    { status: "COMPLETED", issuedAt: new Date("2026-10-21T09:00:00Z") },
  ] as const;

  const sorted = [...queues].sort(compareQueuesForAttention);
  assert.deepEqual(
    sorted.map((row) => row.issuedAt.toISOString()),
    [
      "2026-10-21T08:00:00.000Z",
      "2026-10-21T08:30:00.000Z",
      "2026-10-21T09:00:00.000Z",
      "2026-10-21T07:00:00.000Z",
    ],
  );
});

test("a completed ticket never outranks a waiting one, however recent", () => {
  const finished = {
    status: "COMPLETED" as const,
    issuedAt: new Date("2026-10-21T23:59:00Z"),
  };
  const waiting = {
    status: "WAITING" as const,
    issuedAt: new Date("2026-10-21T00:01:00Z"),
  };
  assert.ok(compareQueuesForAttention(waiting, finished) < 0);
});

test("LIVE_QUEUE_STATUSES only covers tickets that still need an operator", () => {
  assert.deepEqual(
    [...LIVE_QUEUE_STATUSES].sort(),
    ["CALLED", "SERVING", "WAITING"],
  );
  const finished = ["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"] as const;
  for (const status of finished) {
    assert.equal(isLiveQueueStatus(status), false, `${status} must not be live`);
  }
  for (const status of LIVE_QUEUE_STATUSES) {
    assert.equal(isLiveQueueStatus(status), true, `${status} must be live`);
  }
});
