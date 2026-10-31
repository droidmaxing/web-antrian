import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";

export const planSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).nullable().optional(),
  monthlyPrice: z.number().int().min(0).max(2_000_000_000),
  yearlyPrice: z.number().int().min(0).max(2_000_000_000),
  active: z.boolean().default(true),
});
export type PlanInput = z.infer<typeof planSchema>;

export const platformListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PlatformListQuery = z.infer<typeof platformListQuerySchema>;

export async function listPlatformPlans() {
  return prisma.plan.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
}

export async function createPlatformPlan(input: PlanInput) {
  try {
    return await prisma.plan.create({ data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Kode paket sudah digunakan.", 409, "PLAN_CODE_TAKEN");
    }
    throw error;
  }
}

export async function updatePlatformPlan(id: string, input: PlanInput) {
  try {
    return await prisma.plan.update({ where: { id }, data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Kode paket sudah digunakan.", 409, "PLAN_CODE_TAKEN");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError("Paket tidak ditemukan.", 404, "PLAN_NOT_FOUND");
    }
    throw error;
  }
}

export async function listPlatformBusinesses() {
  return prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, slug: true, active: true, createdAt: true,
      _count: { select: { memberships: true } },
      subscription: {
        select: { status: true, trialEndsAt: true, currentPeriodEnd: true, plan: { select: { name: true } } },
      },
    },
  });
}

export async function listPlatformSubscriptions(query: PlatformListQuery) {
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      orderBy: { updatedAt: "desc" },
      skip,
      take: query.pageSize,
      select: {
        id: true, status: true, cycle: true, trialEndsAt: true, currentPeriodEnd: true, startedAt: true, updatedAt: true,
        business: { select: { id: true, name: true, slug: true, active: true } },
        plan: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.subscription.count(),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function listPlatformPayments(query: PlatformListQuery) {
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
      select: {
        id: true, orderId: true, cycle: true, amount: true, status: true, provider: true, paidAt: true, createdAt: true,
        business: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.payment.count(),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function listPlatformUsers(query: PlatformListQuery) {
  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: query.pageSize,
      select: {
        id: true, name: true, email: true, active: true, platformRole: true, createdAt: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: { role: true, business: { select: { id: true, name: true, slug: true } } },
        },
      },
    }),
    prisma.user.count(),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function setBusinessActive(id: string, active: boolean) {
  const result = await prisma.business.updateMany({ where: { id }, data: { active } });
  if (!result.count) throw new AppError("Workspace tidak ditemukan.", 404, "BUSINESS_NOT_FOUND");
  return { id, active };
}

export type ExtendInput = { months: number };
export type AssignPlanInput = { planId: string | null };

export async function resetSubscriptionTrial(businessId: string, adminUserId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    select: { id: true },
  });
  if (!subscription) throw new AppError("Langganan tidak ditemukan.", 404, "SUBSCRIPTION_NOT_FOUND");

  const { trialEndsAt } = await prisma.subscription.update({
    where: { businessId },
    data: {
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: null,
    },
    select: { trialEndsAt: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      businessId,
      actorUserId: adminUserId,
      action: "TRIAL_RESET_BY_PLATFORM",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { trialEndsAt: trialEndsAt?.toISOString() ?? null },
    },
  });

  return { status: "TRIAL", trialEndsAt };
}

export async function assignSubscriptionPlan(businessId: string, input: AssignPlanInput, adminUserId: string) {
  if (input.planId) {
    const plan = await prisma.plan.findFirst({ where: { id: input.planId, active: true } });
    if (!plan) throw new AppError("Paket tidak tersedia.", 404, "PLAN_NOT_FOUND");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    select: { id: true },
  });
  if (!subscription) throw new AppError("Langganan tidak ditemukan.", 404, "SUBSCRIPTION_NOT_FOUND");

  const updated = await prisma.subscription.update({
    where: { businessId },
    data: { planId: input.planId ?? null },
    select: { id: true, planId: true, plan: { select: { id: true, code: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      businessId,
      actorUserId: adminUserId,
      action: "PLAN_ASSIGNED_BY_PLATFORM",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { planId: input.planId ?? null },
    },
  });

  return { planId: updated.planId, plan: updated.plan };
}

export async function extendSubscriptionPeriod(businessId: string, input: ExtendInput, adminUserId: string) {
  const { months } = input;
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    select: { id: true, currentPeriodEnd: true, status: true },
  });
  if (!subscription) throw new AppError("Langganan tidak ditemukan.", 404, "SUBSCRIPTION_NOT_FOUND");

  const base = subscription.currentPeriodEnd ?? new Date();
  const newMonth = base.getUTCMonth() + months;
  const newEnd = new Date(Date.UTC(
    base.getUTCFullYear() + Math.floor(newMonth / 12),
    newMonth % 12,
    Math.min(base.getUTCDate(), 28), // Cap at 28 to avoid month overflow
    base.getUTCHours(),
    base.getUTCMinutes(),
    base.getUTCSeconds(),
    base.getUTCMilliseconds(),
  ));

  const updated = await prisma.subscription.update({
    where: { businessId },
    data: { currentPeriodEnd: newEnd, status: "ACTIVE" },
    select: { id: true, status: true, currentPeriodEnd: true, cycle: true },
  });

  await prisma.auditLog.create({
    data: {
      businessId,
      actorUserId: adminUserId,
      action: "SUBSCRIPTION_EXTENDED_BY_PLATFORM",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { months: months.toString(), newEnd: newEnd.toISOString() },
    },
  });

  return updated;
}
