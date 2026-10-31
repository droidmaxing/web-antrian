import { BillingCycle, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { auditData } from "@/modules/shared/audit";
import { type BusinessContext, requireRole } from "@/modules/tenancy/context";
import {
  advanceSubscriptionPeriod,
  buildOrderId,
  isSubscriptionAllowed,
  parseGrossAmount,
  paymentStatusFromNotification,
} from "@/modules/billing/billing-domain";
import { createSnapTransaction } from "@/modules/billing/midtrans";

export const TRIAL_DAYS = 30;

export function trialEndsAt(now = new Date()) {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export type SubscriptionView = {
  status: SubscriptionStatus;
  cycle: BillingCycle;
  allowed: boolean;
  label: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: { id: string; code: string; name: string; monthlyPrice: number; yearlyPrice: number } | null;
};

export function subscriptionLabel(status: SubscriptionStatus, endsAt: Date | null, now = new Date()) {
  if (status === "SUSPENDED") return "Ditangguhkan";
  if (status === "EXPIRED") return "Kedaluwarsa";
  if (endsAt === null || endsAt.getTime() <= now.getTime()) {
    return status === "TRIAL" ? "Masa coba berakhir" : "Kedaluwarsa";
  }
  return status === "TRIAL" ? "Masa coba gratis" : "Aktif";
}

/** Turns the stored row into what the UI and the gate both need to reason about. */
export function toSubscriptionView(
  row: {
    status: SubscriptionStatus;
    cycle: BillingCycle;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    plan: { id: string; code: string; name: string; monthlyPrice: number; yearlyPrice: number } | null;
  },
  now = new Date(),
): SubscriptionView {
  const endsAt = row.currentPeriodEnd ?? row.trialEndsAt;
  return {
    status: row.status,
    cycle: row.cycle,
    allowed: isSubscriptionAllowed(row.status, endsAt, now),
    label: subscriptionLabel(row.status, endsAt, now),
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    plan: row.plan,
  };
}

export async function getSubscriptionView(businessId: string): Promise<SubscriptionView | null> {
  const row = await prisma.subscription.findUnique({
    where: { businessId },
    include: {
      plan: {
        select: { id: true, code: true, name: true, monthlyPrice: true, yearlyPrice: true },
      },
    },
  });
  return row ? toSubscriptionView(row) : null;
}

export async function listPayments(businessId: string, limit = 20) {
  return prisma.payment.findMany({
    where: { businessId },
    include: { plan: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Creates the pending payment and the Midtrans Snap session. The price is read
 * from the plan row, never from the request body, so a tampered client cannot
 * choose how much it pays.
 */
export async function startCheckout(context: BusinessContext, planId: string, cycle: BillingCycle) {
  requireRole(context, ["OWNER"]);
  const [plan, business, user, subscription] = await Promise.all([
    prisma.plan.findFirst({ where: { id: planId, active: true } }),
    prisma.business.findUnique({ where: { id: context.businessId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: context.userId }, select: { name: true, email: true } }),
    prisma.subscription.findUnique({ where: { businessId: context.businessId }, select: { id: true } }),
  ]);
  if (!plan) throw new AppError("Paket tidak tersedia.", 404, "PLAN_NOT_FOUND");
  const amount = cycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;
  if (amount <= 0) {
    throw new AppError(
      "Harga paket belum diatur. Hubungi administrator platform.",
      409,
      "PLAN_PRICE_MISSING",
    );
  }

  const orderId = buildOrderId(context.businessId);
  await prisma.payment.create({
    data: {
      businessId: context.businessId,
      subscriptionId: subscription?.id ?? null,
      planId: plan.id,
      orderId,
      cycle,
      amount,
    },
  });

  const snap = await createSnapTransaction({
    orderId,
    amount,
    itemName: `${plan.name} (${cycle === "YEARLY" ? "tahunan" : "bulanan"})`,
    customerName: user?.name ?? business?.name ?? "Pelanggan",
    customerEmail: user?.email ?? "",
  });
  return { orderId, amount, ...snap };
}

export type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string | number;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  transaction_id?: string;
};

/**
 * Applies a signature-verified notification. `orderId` is the idempotency key:
 * the paid transition is claimed with a conditional update, so a replayed or
 * concurrently delivered notification extends the period exactly once.
 */
export async function applyMidtransNotification(notification: MidtransNotification) {
  const payment = await prisma.payment.findUnique({ where: { orderId: notification.order_id } });
  if (!payment) return { applied: false, reason: "UNKNOWN_ORDER" };
  const amount = parseGrossAmount(notification.gross_amount);
  if (amount === null || amount !== payment.amount) {
    throw new AppError("Jumlah pembayaran tidak sesuai.", 400, "PAYMENT_AMOUNT_MISMATCH");
  }

  const status = paymentStatusFromNotification(
    notification.transaction_status,
    notification.fraud_status,
  );
  const payload = { ...notification, receivedAt: new Date().toISOString() };

  if (status !== "PAID") {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: { status: status as PaymentStatus, providerRef: notification.transaction_id ?? null, payload },
    });
    return { applied: true, reason: status };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Business WHERE id = ${payment.businessId} FOR UPDATE`;
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "PAID" } },
      data: {
        status: "PAID",
        paidAt: new Date(),
        providerRef: notification.transaction_id ?? null,
        payload,
      },
    });
    if (claimed.count === 0) return { applied: false, reason: "ALREADY_PAID" };

    const existing = await tx.subscription.findUnique({
      where: { businessId: payment.businessId },
    });
    const currentPeriodEnd = advanceSubscriptionPeriod(
      existing?.currentPeriodEnd ?? null,
      payment.cycle,
    );
    const planId = payment.planId ?? existing?.planId ?? null;
    await tx.subscription.upsert({
      where: { businessId: payment.businessId },
      create: {
        businessId: payment.businessId,
        planId,
        status: "ACTIVE",
        cycle: payment.cycle,
        currentPeriodEnd,
      },
      update: { planId, status: "ACTIVE", cycle: payment.cycle, currentPeriodEnd },
    });
    // No signed-in actor: Midtrans is the source of this transition.
    await tx.auditLog.create({
      data: {
        businessId: payment.businessId,
        actorUserId: null,
        action: "PAYMENT_SETTLED",
        targetType: "Payment",
        targetId: payment.id,
        metadata: { orderId: payment.orderId, amount: payment.amount, cycle: payment.cycle },
      },
    });
    return { applied: true, reason: "PAID", currentPeriodEnd };
  });
}

/** Shared by registration and by the platform console when it grants a trial. */
export async function createTrialSubscription(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  businessId: string,
  now = new Date(),
) {
  return tx.subscription.create({
    data: {
      businessId,
      status: "TRIAL",
      cycle: "MONTHLY",
      trialEndsAt: trialEndsAt(now),
    },
  });
}

export async function recordSubscriptionAudit(
  businessId: string,
  actorUserId: string,
  action: string,
  metadata: Record<string, string>,
) {
  await prisma.auditLog.create({
    data: auditData({ businessId, actorUserId, action, targetType: "Subscription", metadata }),
  });
}
