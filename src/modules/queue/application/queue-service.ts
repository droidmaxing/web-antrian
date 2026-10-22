import { FeatureKey, Prisma, QueueStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";
import { AppError } from "@/modules/shared/errors";
import {
  assertQueueTransition,
  statusAfterAction,
  type QueueAction,
} from "@/modules/queue/domain/state-machine";
import { dateForTimezone } from "@/modules/queue/domain/service-date";
import { compareQueuesForAttention } from "@/modules/queue/domain/queue-order";

export async function listQueues(
  context: BusinessContext,
  branchId: string,
) {
  requireRole(context, ["ADMIN", "SUPER_ADMIN", "OWNER"]);
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId: context.businessId,
      active: true,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    select: { timezone: true, business: { select: { timezone: true } } },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");

  const serviceDate = dateForTimezone(branch.timezone ?? branch.business.timezone);
  const queues = await prisma.queue.findMany({
    where: { businessId: context.businessId, branchId, serviceDate },
    include: {
      service: { select: { id: true, name: true, code: true } },
      counter: { select: { id: true, name: true, code: true } },
      customer: { select: { name: true } },
    },
    orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
  });

  // Chronological order buries the people still waiting under a day of finished
  // tickets. Rank live work first, then keep the oldest waiting ticket on top
  // and show recently finished work newest-first.
  return queues.sort(compareQueuesForAttention);
}

type CallNextInput = {
  branchId: string;
  counterId: string;
  serviceId?: string;
};

/**
 * A restricted operator may only touch the counters assigned to them. Throwing
 * here — not in the UI — is what actually stops a hand-crafted request.
 */
function assertCounterAccess(context: BusinessContext, counterId: string | null) {
  if (!context.counterIds) return;
  if (counterId && context.counterIds.includes(counterId)) return;
  throw new AppError(
    "Anda tidak memiliki akses ke loket ini.",
    403,
    "COUNTER_FORBIDDEN",
  );
}

/**
 * Waiting tickets have no counter yet, so the only sensible check is whether
 * one of the operator's counters can serve that ticket's service at all.
 */
async function canOperateUnassigned(
  context: BusinessContext,
  serviceId: string,
): Promise<boolean> {
  if (!context.counterIds) return true;
  const match = await prisma.counterService.findFirst({
    where: {
      counterId: { in: context.counterIds },
      serviceId,
    },
    select: { counterId: true },
  });
  return Boolean(match);
}

export async function callNext(
  context: BusinessContext,
  input: CallNextInput,
) {
  requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
  const branch = await prisma.branch.findFirst({
    where: {
      id: input.branchId,
      businessId: context.businessId,
      active: true,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    select: { id: true, timezone: true, business: { select: { timezone: true } } },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");

  const counter = await prisma.counter.findFirst({
    where: {
      id: input.counterId,
      branchId: branch.id,
      active: true,
    },
    select: { id: true },
  });
  if (!counter) throw new AppError("Loket tidak ditemukan atau bukan wewenang Anda.", 404, "COUNTER_NOT_FOUND");

  // The scope check runs as its own step. Folding it into the same `where` with
  // `id: { in: context.counterIds }` silently replaced the requested id (spread
  // order), so an out-of-scope request quietly operated a different counter.
  assertCounterAccess(context, counter.id);

  const counterServices = await prisma.counterService.findMany({
    where: {
      counterId: counter.id,
      service: { businessId: context.businessId, active: true },
    },
    select: { serviceId: true },
  });
  const serviceIds = counterServices.map(({ serviceId }) => serviceId);
  if (!serviceIds.length) {
    throw new AppError("Loket ini belum memiliki layanan aktif.", 409, "NO_COUNTER_SERVICES");
  }
  if (input.serviceId && !serviceIds.includes(input.serviceId)) {
    throw new AppError("Layanan ini tidak tersedia di loket.", 400, "SERVICE_NOT_AT_COUNTER");
  }

  const features = await prisma.featureConfiguration.findMany({
    where: {
      businessId: context.businessId,
      featureKey: FeatureKey.MULTI_COUNTER,
    },
    select: { enabled: true },
  });
  const multiCounterEnabled = features[0]?.enabled ?? false;
  if (!multiCounterEnabled) {
    const firstCounter = await prisma.counter.findFirst({
      where: { branchId: branch.id, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstCounter?.id !== counter.id) {
      throw new AppError("Fitur multi loket belum aktif.", 403, "FEATURE_DISABLED");
    }
  }

  const serviceDate = dateForTimezone(branch.timezone ?? branch.business.timezone);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM Counter WHERE id = ${counter.id} FOR UPDATE`,
      );
      const lockedCounter = await tx.counter.findUniqueOrThrow({
        where: { id: counter.id },
      });
      if (lockedCounter.activeQueueId) {
        throw new AppError("Loket sedang melayani antrean lain.", 409, "COUNTER_BUSY");
      }

      const eligibleServices = input.serviceId ? [input.serviceId] : serviceIds;
      const eligibleIds = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM Queue
          WHERE branchId = ${branch.id}
            AND businessId = ${context.businessId}
            AND serviceDate = ${serviceDate}
            AND status = 'WAITING'
            AND serviceId IN (${Prisma.join(eligibleServices)})
          ORDER BY issuedAt ASC, id ASC
          LIMIT 1
          FOR UPDATE`,
      );
      const queueId = eligibleIds[0]?.id;
      if (!queueId) {
        throw new AppError("Tidak ada antrean menunggu di layanan loket ini.", 404, "QUEUE_EMPTY");
      }

      const queue = await tx.queue.findUniqueOrThrow({
        where: { id: queueId },
        select: {
          id: true,
          status: true,
          ticketNumber: true,
          service: { select: { name: true } },
        },
      });
      const nextStatus = statusAfterAction("call", queue.status);
      const now = new Date();

      await tx.queue.update({
        where: { id: queue.id },
        data: {
          status: nextStatus,
          counterId: counter.id,
          calledAt: now,
          version: { increment: 1 },
        },
      });
      await tx.counter.update({
        where: { id: counter.id },
        data: { activeQueueId: queue.id },
      });
      await tx.queueHistory.create({
        data: {
          queueId: queue.id,
          actorUserId: context.userId,
          counterId: counter.id,
          fromStatus: queue.status,
          toStatus: nextStatus,
          action: "CALL",
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          branchId: branch.id,
          action: "QUEUE_CALL",
          targetType: "Queue",
          targetId: queue.id,
        },
      });
      const outbox = await tx.outboxEvent.create({
        data: {
          businessId: context.businessId,
          branchId: branch.id,
          eventType: "queue.called",
          aggregateId: queue.id,
          payload: {
            queueId: queue.id,
            ticketNumber: queue.ticketNumber,
            counterId: counter.id,
            counterName: lockedCounter.name,
            serviceName: queue.service.name,
            status: nextStatus,
          },
        },
        select: { id: true },
      });

      // The event id doubles as the announcement idempotency key so the
      // operator station and every connected display agree on "one call, one
      // announcement" even if a response is replayed.
      return {
        id: queue.id,
        ticketNumber: queue.ticketNumber,
        status: nextStatus,
        counterName: lockedCounter.name,
        serviceName: queue.service.name,
        eventId: outbox.id,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

export async function transitionQueue(
  context: BusinessContext,
  queueId: string,
  action: QueueAction,
) {
  requireRole(context, ["ADMIN", "SUPER_ADMIN"]);
  return prisma.$transaction(async (tx) => {
    const visibleQueue = await tx.queue.findFirst({
      where: {
        id: queueId,
        businessId: context.businessId,
        branch: { active: true },
        ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
      },
      select: { id: true },
    });
    if (!visibleQueue) throw new AppError("Antrean tidak ditemukan.", 404, "QUEUE_NOT_FOUND");
    await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM Queue
        WHERE id = ${visibleQueue.id} AND businessId = ${context.businessId}
        LIMIT 1 FOR UPDATE`,
    );
    const queue = await tx.queue.findFirst({
      where: {
        id: visibleQueue.id,
        businessId: context.businessId,
        branch: { active: true },
        ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
      },
    });
    if (!queue) throw new AppError("Antrean tidak ditemukan.", 404, "QUEUE_NOT_FOUND");
    assertQueueTransition(action, queue.status);

    // Counter-bound operators must not act on another counter's ticket, and a
    // still-waiting ticket is only theirs if one of their counters serves it.
    if (context.counterIds) {
      if (queue.counterId) {
        assertCounterAccess(context, queue.counterId);
      } else if (!(await canOperateUnassigned(context, queue.serviceId))) {
        throw new AppError(
          "Antrean ini bukan layanan yang ditangani loket Anda.",
          403,
          "COUNTER_FORBIDDEN",
        );
      }
    }

    if (action === "call") {
      throw new AppError("Gunakan panggil antrean berikutnya.", 400, "CALL_NEXT_REQUIRED");
    }
    if (!queue.counterId && ["recall", "start", "no-show"].includes(action)) {
      throw new AppError("Antrean belum terhubung ke loket.", 409, "COUNTER_NOT_ASSIGNED");
    }

    const assignedCounterId = queue.counterId;
    const counter = assignedCounterId
      ? await (async () => {
          await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT id FROM Counter WHERE id = ${assignedCounterId} FOR UPDATE`,
          );
          return tx.counter.findUniqueOrThrow({ where: { id: assignedCounterId } });
        })()
      : null;
    if (
      counter &&
      ["CALLED", "SERVING"].includes(queue.status) &&
      counter.activeQueueId !== queue.id
    ) {
      throw new AppError("Status loket tidak konsisten dengan antrean.", 409, "COUNTER_QUEUE_MISMATCH");
    }

    const nextStatus: QueueStatus = statusAfterAction(action, queue.status);
    const now = new Date();
    const service = await tx.service.findUniqueOrThrow({
      where: { id: queue.serviceId },
      select: { name: true },
    });
    const releasesCounter = [
      "complete",
      "skip",
      "no-show",
      "return-to-waiting",
      "cancel",
    ].includes(action);
    if (releasesCounter && queue.counterId) {
      await tx.counter.updateMany({
        where: { id: queue.counterId, activeQueueId: queue.id },
        data: { activeQueueId: null },
      });
    }

    await tx.queue.update({
      where: { id: queue.id },
      data: {
        status: nextStatus,
        ...(action === "start" ? { startedAt: now } : {}),
        ...(action === "complete" ? { completedAt: now } : {}),
        ...(action === "return-to-waiting" ? { counterId: null, calledAt: null } : {}),
        version: { increment: 1 },
      },
    });
    await tx.queueHistory.create({
      data: {
        queueId: queue.id,
        actorUserId: context.userId,
        counterId: queue.counterId,
        fromStatus: queue.status,
        toStatus: nextStatus,
        action: action.replaceAll("-", "_").toUpperCase(),
      },
    });
    await tx.auditLog.create({
      data: {
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: queue.branchId,
        action: `QUEUE_${action.replaceAll("-", "_").toUpperCase()}`,
        targetType: "Queue",
        targetId: queue.id,
      },
    });
    const outbox = await tx.outboxEvent.create({
      data: {
        businessId: context.businessId,
        branchId: queue.branchId,
        eventType: `queue.${action}`,
        aggregateId: queue.id,
        payload: {
          queueId: queue.id,
          ticketNumber: queue.ticketNumber,
          status: nextStatus,
          counterId: queue.counterId,
          counterName: counter?.name ?? null,
          serviceName: service.name,
        },
      },
      select: { id: true },
    });

    return {
      id: queue.id,
      status: nextStatus,
      ticketNumber: queue.ticketNumber,
      counterName: counter?.name ?? null,
      serviceName: service.name,
      eventId: outbox.id,
    };
  });
}
