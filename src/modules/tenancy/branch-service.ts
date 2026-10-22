import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { auditData } from "@/modules/shared/audit";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export type BranchRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  active: boolean;
  counterCount: number;
  queueCount: number;
  operatingHours: { weekday: number; opensAt: string; closesAt: string; closed: boolean }[];
  ticketPrefix: string;
  resetDaily: boolean;
  estimateBuffer: number;
};

export async function listBranches(context: BusinessContext): Promise<BranchRow[]> {
  requireRole(context, ["OWNER", "SUPER_ADMIN", "ADMIN"]);
  const branches = await prisma.branch.findMany({
    where: {
      businessId: context.businessId,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    include: {
      _count: { select: { counters: true, queues: true } },
      operatingHours: { orderBy: { weekday: "asc" } },
      queueConfig: true,
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    timezone: branch.timezone ?? "Asia/Jakarta",
    active: branch.active,
    counterCount: branch._count.counters,
    queueCount: branch._count.queues,
    operatingHours: branch.operatingHours.map((hour) => ({
      weekday: hour.weekday,
      opensAt: hour.opensAt,
      closesAt: hour.closesAt,
      closed: hour.closed,
    })),
    ticketPrefix: branch.queueConfig?.ticketPrefix ?? "Q",
    resetDaily: branch.queueConfig?.resetDaily ?? true,
    estimateBuffer: branch.queueConfig?.estimateBuffer ?? 0,
  }));
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type BranchInput = {
  name: string;
  timezone?: string;
  ticketPrefix?: string;
  resetDaily?: boolean;
  estimateBuffer?: number;
  operatingHours?: { weekday: number; opensAt: string; closesAt: string; closed?: boolean }[];
};

async function assertFeature(context: BusinessContext, key: "MULTI_BRANCH") {
  const feature = await prisma.featureConfiguration.findUnique({
    where: {
      businessId_featureKey: { businessId: context.businessId, featureKey: key },
    },
    select: { enabled: true },
  });
  if (!feature?.enabled) {
    throw new AppError(
      "Fitur multi cabang belum aktif untuk bisnis ini.",
      403,
      "FEATURE_DISABLED",
    );
  }
}

export async function createBranch(context: BusinessContext, input: BranchInput) {
  requireRole(context, ["SUPER_ADMIN"]);
  const existing = await prisma.branch.count({ where: { businessId: context.businessId } });
  if (existing > 0) await assertFeature(context, "MULTI_BRANCH");
  if (input.operatingHours) validateHours(input.operatingHours);

  const baseSlug = slugify(input.name) || "cabang";
  let slug = baseSlug;
  for (let suffix = 1; ; suffix += 1) {
    const clash = await prisma.branch.findFirst({
      where: { businessId: context.businessId, slug },
      select: { id: true },
    });
    if (!clash) break;
    slug = `${baseSlug}-${suffix}`;
    if (suffix > 50) throw new AppError("Nama cabang terlalu mirip.", 409, "DUPLICATE_BRANCH");
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        businessId: context.businessId,
        name: input.name,
        slug,
        timezone: input.timezone ?? null,
        queueConfig: {
          create: {
            ticketPrefix: input.ticketPrefix ?? "Q",
            resetDaily: input.resetDaily ?? true,
            estimateBuffer: input.estimateBuffer ?? 0,
          },
        },
        operatingHours: {
          create: (input.operatingHours ?? defaultHours()).map((hour) => ({
            weekday: hour.weekday,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            closed: hour.closed ?? false,
          })),
        },
      },
      include: { operatingHours: true, queueConfig: true },
    });
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: branch.id,
        action: "BRANCH_CREATED",
        targetType: "Branch",
        targetId: branch.id,
        metadata: { name: branch.name, slug: branch.slug },
      }),
    });
    return branch;
  });
}

export type UpdateBranchInput = Partial<BranchInput> & { active?: boolean };

export async function updateBranch(
  context: BusinessContext,
  branchId: string,
  input: UpdateBranchInput,
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId: context.businessId,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
    },
    select: { id: true },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
  if (input.operatingHours) validateHours(input.operatingHours);
  if (input.active === false) {
    const openQueues = await prisma.queue.count({
      where: {
        branchId: branch.id,
        status: { in: ["WAITING", "CALLED", "SERVING"] },
      },
    });
    if (openQueues > 0) {
      throw new AppError(
        "Cabang masih memiliki antrean aktif. Selesaikan antrean sebelum menonaktifkan cabang.",
        409,
        "BRANCH_BUSY",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branch.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        ...(input.active === undefined ? {} : { active: input.active }),
        queueConfig: {
          upsert: {
            create: {
              ticketPrefix: input.ticketPrefix ?? "Q",
              resetDaily: input.resetDaily ?? true,
              estimateBuffer: input.estimateBuffer ?? 0,
            },
            update: {
              ...(input.ticketPrefix === undefined ? {} : { ticketPrefix: input.ticketPrefix }),
              ...(input.resetDaily === undefined ? {} : { resetDaily: input.resetDaily }),
              ...(input.estimateBuffer === undefined
                ? {}
                : { estimateBuffer: input.estimateBuffer }),
            },
          },
        },
      },
    });
    if (input.operatingHours) {
      for (const hour of input.operatingHours) {
        await tx.operatingHours.upsert({
          where: { branchId_weekday: { branchId: branch.id, weekday: hour.weekday } },
          create: {
            branchId: branch.id,
            weekday: hour.weekday,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            closed: hour.closed ?? false,
          },
          update: {
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            closed: hour.closed ?? false,
          },
        });
      }
    }
    await tx.auditLog.create({
      data: auditData({
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: branch.id,
        action: "BRANCH_UPDATED",
        targetType: "Branch",
        targetId: branch.id,
        metadata: { changed: Object.keys(input) },
      }),
    });
    return updated;
  });
}

function validateHours(hours: NonNullable<BranchInput["operatingHours"]>) {
  for (const hour of hours) {
    if (hour.weekday < 0 || hour.weekday > 6) {
      throw new AppError("Hari operasional tidak valid.", 400, "INVALID_OPERATING_HOURS");
    }
    if (hour.closed) continue;
    if (!TIME_PATTERN.test(hour.opensAt) || !TIME_PATTERN.test(hour.closesAt)) {
      throw new AppError(
        "Format jam operasional harus HH:MM.",
        400,
        "INVALID_OPERATING_HOURS",
      );
    }
    if (hour.opensAt >= hour.closesAt) {
      throw new AppError(
        "Jam tutup harus lebih lambat dari jam buka.",
        400,
        "INVALID_OPERATING_HOURS",
      );
    }
  }
}

export function defaultHours() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "08:00",
    closesAt: "17:00",
    closed: weekday === 0,
  }));
}
