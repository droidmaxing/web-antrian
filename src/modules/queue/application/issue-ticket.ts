import type { Prisma } from "@prisma/client";
import { QueueStatus } from "@prisma/client";
import { autoAssignCounter } from "@/modules/queue/application/counter-assignment";

/** Nomor yang belum dilayani; nomor yang sudah CALLED/SERVING juga batal. */
const RELEASABLE_QUEUE_STATUSES: QueueStatus[] = [QueueStatus.WAITING, QueueStatus.CALLED];

/**
 * Loket yang masih "menahan" nomor itu ikut dilepas; tanpa ini loket tetap
 * terkunci (activeQueueId) padahal nomornya sudah dibatalkan → COUNTER_BUSY
 * selamanya sampai loket dinonaktifkan admin.
 */
async function releaseCounter(
  tx: Prisma.TransactionClient,
  queueId: string,
): Promise<void> {
  await tx.counter.updateMany({
    where: { activeQueueId: queueId },
    data: { activeQueueId: null },
  });
}

/**
 * Terbitkan satu nomor antrean untuk layanan+tanggal: urutan per hari, pemilihan
 * loket otomatis, jejak status, dan event outbox. Dipakai oleh ambil nomor
 * langsung di lokasi, booking online, dan check-in booking.
 */
export async function issueTicket(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    branchId: string;
    service: { id: string; code: string };
    customerId: string;
    serviceDate: Date;
    /** Label aksi untuk QueueHistory, mis. "ISSUE" atau "BOOKING_CREATE". */
    action: string;
    bookingId?: string;
    actorUserId?: string | null;
    issuedAt?: Date;
    /** Ditulis ke payload outbox bila ada (mis. "BOOKING"). */
    source?: string;
  },
) {
  const { businessId, branchId, service, customerId, serviceDate } = params;
  const sequenceKey = {
    branchId_serviceId_serviceDate: {
      branchId,
      serviceId: service.id,
      serviceDate,
    },
  };
  await tx.queueSequence.upsert({
    where: sequenceKey,
    create: { branchId, serviceId: service.id, serviceDate, lastNumber: 0 },
    update: {},
  });
  const sequence = await tx.queueSequence.update({
    where: sequenceKey,
    data: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  const queue = await tx.queue.create({
    data: {
      businessId,
      branchId,
      serviceId: service.id,
      customerId,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      serviceDate,
      sequenceNumber: sequence.lastNumber,
      ticketNumber: `${service.code}-${String(sequence.lastNumber).padStart(3, "0")}`,
      issuedAt: params.issuedAt ?? new Date(),
      counterId: await autoAssignCounter(tx, {
        businessId,
        branchId,
        serviceId: service.id,
        serviceDate,
      }),
    },
    select: {
      id: true,
      ticketNumber: true,
      issuedAt: true,
      sequenceNumber: true,
      status: true,
    },
  });
  await tx.queueHistory.create({
    data: {
      queueId: queue.id,
      actorUserId: params.actorUserId ?? null,
      fromStatus: null,
      toStatus: "WAITING",
      action: params.action,
    },
  });
  await tx.outboxEvent.create({
    data: {
      businessId,
      branchId,
      eventType: "queue.issued",
      aggregateId: queue.id,
      payload: {
        queueId: queue.id,
        ticketNumber: queue.ticketNumber,
        ...(params.source ? { source: params.source } : {}),
      },
    },
  });
  return queue;
}

/**
 * Lepaskan nomor yang batal (booking dibatalkan / pelanggan tidak hadir) supaya
 * tidak menggantung di daftar tunggu petugas. Nomor yang sudah selesai dilayani
 * tidak diubah.
 */
export async function releaseTicket(
  tx: Prisma.TransactionClient,
  params: {
    queueId: string;
    status: QueueStatus;
    actorUserId?: string | null;
  },
) {
  const current = await tx.queue.findUnique({
    where: { id: params.queueId },
    select: { status: true },
  });
  if (!current || !RELEASABLE_QUEUE_STATUSES.includes(current.status)) {
    return false;
  }
  await tx.queue.update({
    where: { id: params.queueId },
    data: { status: params.status },
  });
  await releaseCounter(tx, params.queueId);
  await tx.queueHistory.create({
    data: {
      queueId: params.queueId,
      actorUserId: params.actorUserId ?? null,
      fromStatus: current.status,
      toStatus: params.status,
      action: "BOOKING_RELEASED",
    },
  });
  return true;
}
