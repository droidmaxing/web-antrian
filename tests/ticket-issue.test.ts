import assert from "node:assert/strict";
import test from "node:test";
import { QueueStatus, type Prisma } from "@prisma/client";
import { issueTicket, releaseTicket } from "../src/modules/queue/application/issue-ticket";

/** Prisma client tiruan: cukup untuk melacak tulisan yang dilakukan helper. */
function fakeTx(options: { lastNumber?: number; currentStatus?: string | null } = {}) {
  const writes: {
    queue: Record<string, unknown>[];
    history: Record<string, unknown>[];
    counterRelease: Record<string, unknown>[];
  } = {
    queue: [],
    history: [],
    counterRelease: [],
  };
  const counters = [
    { id: "loket-1" },
    { id: "loket-2" },
  ];
  const tx = {
    queueSequence: {
      upsert: async () => ({}),
      update: async () => ({ lastNumber: options.lastNumber ?? 1 }),
    },
    service: { findFirst: async () => ({ id: "layanan-1" }) },
    counter: {
      findMany: async () => counters,
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        writes.counterRelease.push(where);
        return { count: 1 };
      },
    },
    queue: {
      groupBy: async () => [
        { counterId: "loket-1", _count: { _all: 3 } },
        { counterId: "loket-2", _count: { _all: 0 } },
      ],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.queue.push(data);
        return {
          id: "queue-1",
          ticketNumber: data.ticketNumber,
          issuedAt: data.issuedAt,
          sequenceNumber: data.sequenceNumber,
          status: "WAITING",
        };
      },
      findUnique: async () =>
        options.currentStatus === null ? null : { status: options.currentStatus ?? "WAITING" },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.queue.push(data);
        return data;
      },
    },
    queueHistory: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.history.push(data);
        return data;
      },
    },
    outboxEvent: { create: async () => ({}) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, writes };
}

test("nomor tiket memakai kode layanan dan urutan hari itu", async () => {
  const { tx, writes } = fakeTx({ lastNumber: 7 });
  const queue = await issueTicket(tx, {
    businessId: "bisnis-1",
    branchId: "cabang-1",
    service: { id: "layanan-1", code: "UMUM" },
    customerId: "pelanggan-1",
    serviceDate: new Date("2026-11-02T00:00:00.000Z"),
    action: "BOOKING_CREATE",
    bookingId: "booking-1",
  });
  assert.equal(queue.ticketNumber, "UMUM-007");
  assert.equal(writes.queue[0].bookingId, "booking-1");
  // Loket paling sepi dipilih otomatis (loket-2 tanpa antrean menunggu).
  assert.equal(writes.queue[0].counterId, "loket-2");
  assert.equal(writes.history[0].action, "BOOKING_CREATE");
  assert.equal(writes.history[0].toStatus, "WAITING");
});

test("nomor terlama tetap bebas loket bila layanan tidak memakai loket otomatis", async () => {
  const { tx } = fakeTx();
  (tx as unknown as { service: { findFirst: () => Promise<null> } }).service.findFirst =
    async () => null;
  const queue = await issueTicket(tx, {
    businessId: "bisnis-1",
    branchId: "cabang-1",
    service: { id: "layanan-1", code: "GIGI" },
    customerId: "pelanggan-1",
    serviceDate: new Date("2026-11-02T00:00:00.000Z"),
    action: "ISSUE",
  });
  assert.equal(queue.ticketNumber, "GIGI-001");
});

test("nomor yang batal dilepas, nomor yang sudah dilayani tidak diubah", async () => {
  const waiting = fakeTx({ currentStatus: QueueStatus.WAITING });
  assert.equal(
    await releaseTicket(waiting.tx, {
      queueId: "queue-1",
      status: QueueStatus.CANCELLED,
      actorUserId: "petugas-1",
    }),
    true,
  );
  assert.equal(waiting.writes.queue[0].status, QueueStatus.CANCELLED);
  assert.equal(waiting.writes.history[0].action, "BOOKING_RELEASED");
  // Loket yang menahan nomor itu ikut dilepas, kalau tidak loket terkunci.
  assert.deepEqual(waiting.writes.counterRelease, [{ activeQueueId: "queue-1" }]);

  const completed = fakeTx({ currentStatus: QueueStatus.COMPLETED });
  assert.equal(
    await releaseTicket(completed.tx, {
      queueId: "queue-1",
      status: QueueStatus.NO_SHOW,
    }),
    false,
  );
  assert.equal(completed.writes.queue.length, 0);
  assert.equal(completed.writes.counterRelease.length, 0);

  const missing = fakeTx({ currentStatus: null });
  assert.equal(
    await releaseTicket(missing.tx, { queueId: "queue-1", status: QueueStatus.NO_SHOW }),
    false,
  );
});
