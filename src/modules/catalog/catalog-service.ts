import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { auditData } from "@/modules/shared/audit";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

const ALL_ROLES = ["OWNER", "SUPER_ADMIN", "ADMIN"] as const;

function translateUnique(error: unknown, message: string, code: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new AppError(message, 409, code);
  }
  return error;
}

async function assertBranch(context: BusinessContext, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId: context.businessId,
      active: true,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    select: { id: true, timezone: true, business: { select: { timezone: true } } },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
  return branch;
}

/* ------------------------------------------------------------------ services */

export type ServiceInput = {
  name: string;
  code: string;
  description?: string | null;
  averageMinutes: number;
  active?: boolean;
};

export async function listServices(context: BusinessContext) {
  requireRole(context, [...ALL_ROLES]);
  const services = await prisma.service.findMany({
    where: { businessId: context.businessId },
    include: {
      _count: { select: { queues: true, counterServices: true, bookings: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return services.map(({ _count, ...service }) => ({
    ...service,
    queueCount: _count.queues,
    counterCount: _count.counterServices,
    bookingCount: _count.bookings,
  }));
}

export async function createService(context: BusinessContext, input: ServiceInput) {
  requireRole(context, ["SUPER_ADMIN"]);
  try {
    return await prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          businessId: context.businessId,
          name: input.name,
          code: input.code,
          description: input.description ?? null,
          averageMinutes: input.averageMinutes,
          active: input.active ?? true,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          businessId: context.businessId,
          actorUserId: context.userId,
          action: "SERVICE_CREATED",
          targetType: "Service",
          targetId: service.id,
          metadata: { code: service.code, name: service.name },
        }),
      });
      return service;
    });
  } catch (error) {
    throw translateUnique(error, "Kode layanan sudah dipakai.", "DUPLICATE_SERVICE_CODE");
  }
}

export async function updateService(
  context: BusinessContext,
  serviceId: string,
  input: Partial<ServiceInput>,
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const existing = await prisma.service.findFirst({
    where: { id: serviceId, businessId: context.businessId },
    select: { id: true },
  });
  if (!existing) throw new AppError("Layanan tidak ditemukan.", 404, "SERVICE_NOT_FOUND");
  try {
    return await prisma.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id: existing.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.averageMinutes === undefined ? {} : { averageMinutes: input.averageMinutes }),
          ...(input.active === undefined ? {} : { active: input.active }),
        },
      });
      await tx.auditLog.create({
        data: auditData({
          businessId: context.businessId,
          actorUserId: context.userId,
          action: "SERVICE_UPDATED",
          targetType: "Service",
          targetId: service.id,
          metadata: { changed: Object.keys(input) },
        }),
      });
      return service;
    });
  } catch (error) {
    throw translateUnique(error, "Kode layanan sudah dipakai.", "DUPLICATE_SERVICE_CODE");
  }
}

/**
 * Services referenced by queue history are never hard-deleted: the reporting
 * trail must stay intact, so they are archived (active = false) instead.
 */
export async function deleteService(context: BusinessContext, serviceId: string) {
  requireRole(context, ["SUPER_ADMIN"]);
  const service = await prisma.service.findFirst({
    where: { id: serviceId, businessId: context.businessId },
    include: { _count: { select: { queues: true, bookings: true } } },
  });
  if (!service) throw new AppError("Layanan tidak ditemukan.", 404, "SERVICE_NOT_FOUND");

  const archived = service._count.queues > 0 || service._count.bookings > 0;
  return prisma.$transaction(async (tx) => {
    if (archived) {
      await tx.service.update({ where: { id: service.id }, data: { active: false } });
    } else {
      await tx.service.delete({ where: { id: service.id } });
    }
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        action: archived ? "SERVICE_ARCHIVED" : "SERVICE_DELETED",
        targetType: "Service",
        targetId: service.id,
        metadata: { code: service.code, queues: service._count.queues },
      }),
    });
    return { id: service.id, archived };
  });
}

/* ------------------------------------------------------------------ counters */

export type CounterInput = {
  branchId: string;
  name: string;
  code: string;
  active?: boolean;
  serviceIds: string[];
};

export async function listCounters(context: BusinessContext, branchId: string) {
  requireRole(context, [...ALL_ROLES]);
  await assertBranch(context, branchId);
  const counters = await prisma.counter.findMany({
    where: { branchId },
    include: {
      services: { select: { serviceId: true } },
      activeQueue: { select: { ticketNumber: true, status: true } },
      _count: { select: { assignedQueues: true } },
    },
    orderBy: [{ active: "desc" }, { code: "asc" }],
  });
  return counters.map(({ services, _count, ...counter }) => ({
    ...counter,
    serviceIds: services.map((entry) => entry.serviceId),
    ticketCount: _count.assignedQueues,
  }));
}

async function normalizeServiceIds(context: BusinessContext, serviceIds: string[]) {
  const unique = [...new Set(serviceIds)];
  if (!unique.length) {
    throw new AppError(
      "Pilih minimal satu layanan untuk loket ini.",
      400,
      "COUNTER_SERVICES_REQUIRED",
    );
  }
  const found = await prisma.service.findMany({
    where: { id: { in: unique }, businessId: context.businessId, active: true },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new AppError("Ada layanan yang tidak valid.", 400, "INVALID_SERVICE");
  }
  return unique;
}

export async function createCounter(context: BusinessContext, input: CounterInput) {
  requireRole(context, ["SUPER_ADMIN"]);
  await assertBranch(context, input.branchId);
  const serviceIds = await normalizeServiceIds(context, input.serviceIds);
  try {
    return await prisma.$transaction(async (tx) => {
      const counter = await tx.counter.create({
        data: {
          branchId: input.branchId,
          name: input.name,
          code: input.code,
          active: input.active ?? true,
          services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        },
      });
      await tx.auditLog.create({
        data: auditData({
          businessId: context.businessId,
          actorUserId: context.userId,
          branchId: input.branchId,
          action: "COUNTER_CREATED",
          targetType: "Counter",
          targetId: counter.id,
          metadata: { code: counter.code, serviceIds },
        }),
      });
      return counter;
    });
  } catch (error) {
    throw translateUnique(error, "Kode loket sudah dipakai di cabang ini.", "DUPLICATE_COUNTER_CODE");
  }
}

export async function updateCounter(
  context: BusinessContext,
  counterId: string,
  input: Partial<Omit<CounterInput, "branchId">>,
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const counter = await prisma.counter.findFirst({
    where: { id: counterId, branch: { businessId: context.businessId } },
    select: { id: true, branchId: true, activeQueueId: true, code: true },
  });
  if (!counter) throw new AppError("Loket tidak ditemukan.", 404, "COUNTER_NOT_FOUND");
  if (input.active === false && counter.activeQueueId) {
    throw new AppError(
      "Loket masih melayani antrean. Selesaikan antrean sebelum menonaktifkan loket.",
      409,
      "COUNTER_BUSY",
    );
  }
  const serviceIds =
    input.serviceIds === undefined
      ? null
      : await normalizeServiceIds(context, input.serviceIds);

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.counter.update({
        where: { id: counter.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.active === undefined ? {} : { active: input.active }),
        },
      });
      if (serviceIds) {
        await tx.counterService.deleteMany({ where: { counterId: counter.id } });
        await tx.counterService.createMany({
          data: serviceIds.map((serviceId) => ({ counterId: counter.id, serviceId })),
        });
      }
      await tx.auditLog.create({
        data: auditData({
          businessId: context.businessId,
          actorUserId: context.userId,
          branchId: counter.branchId,
          action: "COUNTER_UPDATED",
          targetType: "Counter",
          targetId: counter.id,
          metadata: { changed: Object.keys(input), serviceIds },
        }),
      });
      return updated;
    });
  } catch (error) {
    throw translateUnique(error, "Kode loket sudah dipakai di cabang ini.", "DUPLICATE_COUNTER_CODE");
  }
}

export async function deleteCounter(context: BusinessContext, counterId: string) {
  requireRole(context, ["SUPER_ADMIN"]);
  const counter = await prisma.counter.findFirst({
    where: { id: counterId, branch: { businessId: context.businessId } },
    include: { _count: { select: { assignedQueues: true } } },
  });
  if (!counter) throw new AppError("Loket tidak ditemukan.", 404, "COUNTER_NOT_FOUND");
  if (counter.activeQueueId) {
    throw new AppError(
      "Loket masih melayani antrean. Selesaikan antrean terlebih dahulu.",
      409,
      "COUNTER_BUSY",
    );
  }
  const archived = counter._count.assignedQueues > 0;
  return prisma.$transaction(async (tx) => {
    if (archived) {
      await tx.counter.update({ where: { id: counter.id }, data: { active: false } });
    } else {
      await tx.counter.delete({ where: { id: counter.id } });
    }
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: counter.branchId,
        action: archived ? "COUNTER_ARCHIVED" : "COUNTER_DELETED",
        targetType: "Counter",
        targetId: counter.id,
        metadata: { code: counter.code },
      }),
    });
    return { id: counter.id, archived };
  });
}
