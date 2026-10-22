import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

export type ReportRange = { from: string; to: string; branchId: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 92;

function parseDay(value: string, label: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new AppError(`Format ${label} harus YYYY-MM-DD.`, 400, "INVALID_DATE");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`Tanggal ${label} tidak valid.`, 400, "INVALID_DATE");
  }
  return date;
}

export type ReportSummary = {
  range: { from: string; to: string };
  totals: {
    issued: number;
    completed: number;
    cancelled: number;
    noShow: number;
    skipped: number;
  };
  averages: { waitMinutes: number; serviceMinutes: number };
  completionRate: number;
  services: {
    serviceId: string;
    serviceName: string;
    serviceCode: string;
    issued: number;
    completed: number;
    averageWaitMinutes: number;
  }[];
  counters: {
    counterId: string;
    counterName: string;
    counterCode: string;
    served: number;
    averageServiceMinutes: number;
  }[];
  daily: { date: string; issued: number; completed: number; averageWaitMinutes: number }[];
  hourly: { hour: number; issued: number }[];
};

function minutesBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 60_000;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Aggregates queue history for a branch over a bounded date range. Everything is
 * computed from `Queue` rows so the report always matches what operators saw.
 */
export async function getReport(
  context: BusinessContext,
  input: ReportRange,
): Promise<ReportSummary> {
  requireRole(context, ["OWNER", "SUPER_ADMIN"]);
  const from = parseDay(input.from, "tanggal awal");
  const to = parseDay(input.to, "tanggal akhir");
  if (from > to) {
    throw new AppError(
      "Tanggal awal harus sebelum tanggal akhir.",
      400,
      "INVALID_RANGE",
    );
  }
  const days = Math.floor(minutesBetween(from, to) / 60 / 24) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new AppError(
      `Rentang laporan maksimal ${MAX_RANGE_DAYS} hari.`,
      400,
      "RANGE_TOO_LARGE",
    );
  }

  const branch = await prisma.branch.findFirst({
    where: {
      id: input.branchId,
      businessId: context.businessId,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    select: { id: true, timezone: true, business: { select: { timezone: true } } },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
  const timezone = branch.timezone ?? branch.business.timezone;

  const queues = await prisma.queue.findMany({
    where: {
      businessId: context.businessId,
      branchId: branch.id,
      serviceDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      status: true,
      issuedAt: true,
      startedAt: true,
      completedAt: true,
      serviceDate: true,
      service: { select: { id: true, name: true, code: true } },
      counter: { select: { id: true, name: true, code: true } },
    },
  });

  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const localHour = (date: Date) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(date),
    );

  const completed = queues.filter((queue) => queue.status === "COMPLETED");
  const waitMinutes = queues
    .filter((queue) => queue.startedAt)
    .map((queue) => minutesBetween(queue.issuedAt, queue.startedAt!));
  const serviceMinutes = completed
    .filter((queue) => queue.startedAt && queue.completedAt)
    .map((queue) => minutesBetween(queue.startedAt!, queue.completedAt!));

  const services = new Map<
    string,
    {
      serviceId: string;
      serviceName: string;
      serviceCode: string;
      issued: number;
      completed: number;
      waits: number[];
    }
  >();
  for (const queue of queues) {
    const entry = services.get(queue.service.id) ?? {
      serviceId: queue.service.id,
      serviceName: queue.service.name,
      serviceCode: queue.service.code,
      issued: 0,
      completed: 0,
      waits: [],
    };
    entry.issued += 1;
    if (queue.status === "COMPLETED") entry.completed += 1;
    if (queue.startedAt) entry.waits.push(minutesBetween(queue.issuedAt, queue.startedAt));
    services.set(queue.service.id, entry);
  }

  const counters = new Map<
    string,
    {
      counterId: string;
      counterName: string;
      counterCode: string;
      served: number;
      durations: number[];
    }
  >();
  for (const queue of completed) {
    if (!queue.counter) continue;
    const entry = counters.get(queue.counter.id) ?? {
      counterId: queue.counter.id,
      counterName: queue.counter.name,
      counterCode: queue.counter.code,
      served: 0,
      durations: [],
    };
    entry.served += 1;
    if (queue.startedAt && queue.completedAt) {
      entry.durations.push(minutesBetween(queue.startedAt, queue.completedAt));
    }
    counters.set(queue.counter.id, entry);
  }

  const daily = new Map<string, { issued: number; completed: number; waits: number[] }>();
  for (const queue of queues) {
    const key = dayKey(queue.serviceDate);
    const entry = daily.get(key) ?? { issued: 0, completed: 0, waits: [] };
    entry.issued += 1;
    if (queue.status === "COMPLETED") entry.completed += 1;
    if (queue.startedAt) entry.waits.push(minutesBetween(queue.issuedAt, queue.startedAt));
    daily.set(key, entry);
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, issued: 0 }));
  for (const queue of queues) {
    hourly[localHour(queue.issuedAt)].issued += 1;
  }

  const cancelled = queues.filter((queue) => queue.status === "CANCELLED").length;
  const noShow = queues.filter((queue) => queue.status === "NO_SHOW").length;
  const skipped = queues.filter((queue) => queue.status === "SKIPPED").length;

  return {
    range: { from: dayKey(from), to: dayKey(to) },
    totals: {
      issued: queues.length,
      completed: completed.length,
      cancelled,
      noShow,
      skipped,
    },
    averages: {
      waitMinutes: average(waitMinutes),
      serviceMinutes: average(serviceMinutes),
    },
    completionRate: queues.length
      ? Math.round((completed.length / queues.length) * 100)
      : 0,
    services: [...services.values()]
      .map(({ waits, ...entry }) => ({
        ...entry,
        averageWaitMinutes: average(waits),
      }))
      .sort((a, b) => b.issued - a.issued),
    counters: [...counters.values()]
      .map(({ durations, ...entry }) => ({
        ...entry,
        averageServiceMinutes: average(durations),
      }))
      .sort((a, b) => b.served - a.served),
    daily: [...daily.entries()]
      .map(([date, entry]) => ({
        date,
        issued: entry.issued,
        completed: entry.completed,
        averageWaitMinutes: average(entry.waits),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    hourly: hourly.filter((slot) => slot.issued > 0),
  };
}

export async function listAuditTrail(context: BusinessContext, limit = 50) {
  requireRole(context, ["OWNER", "SUPER_ADMIN"]);
  const logs = await prisma.auditLog.findMany({
    where: {
      businessId: context.businessId,
      ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
    },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    createdAt: log.createdAt.toISOString(),
    actor: log.actor?.name ?? log.actor?.email ?? "Sistem",
    metadata: log.metadata,
  }));
}
