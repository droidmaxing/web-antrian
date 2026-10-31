import { createHash, timingSafeEqual } from "node:crypto";

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "EXPIRED" | "SUSPENDED";
export type BillingCycle = "MONTHLY" | "YEARLY";

export function isSubscriptionAllowed(
  status: SubscriptionStatus,
  endsAt: Date | null,
  now = new Date(),
): boolean {
  if (status === "SUSPENDED" || status === "EXPIRED") return false;
  if (status === "ACTIVE" && endsAt === null) return true;
  return (status === "ACTIVE" || status === "TRIAL") && endsAt !== null && endsAt.getTime() > now.getTime();
}

export function advanceSubscriptionPeriod(
  currentPeriodEnd: Date | null,
  cycle: BillingCycle,
  now = new Date(),
): Date {
  const base = new Date(Math.max(currentPeriodEnd?.getTime() ?? 0, now.getTime()));
  const day = base.getUTCDate();
  const month = base.getUTCMonth() + (cycle === "MONTHLY" ? 1 : 12);
  const result = new Date(base);
  result.setUTCDate(1);
  result.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signature: string,
): boolean {
  if (!/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(midtransSignature(orderId, statusCode, grossAmount, serverKey), "hex");
  const received = Buffer.from(signature, "hex");
  return timingSafeEqual(expected, received);
}

/** Midtrans order ids must stay short and unique across every tenant. */
export function buildOrderId(businessId: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = createHash("sha256")
    .update(`${businessId}:${now.getTime()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
  return `SUB-${stamp}-${suffix}`;
}

/**
 * Midtrans sends `gross_amount` as a decimal string; amounts are whole rupiah.
 * Returns null for anything that is not a plain non-negative amount, so the
 * webhook can reject a tampered notification instead of trusting it.
 */
export function parseGrossAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !/^\d+(\.00?)?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

/** Midtrans transaction statuses that mean the money is actually in. */
export function paymentStatusFromNotification(
  transactionStatus: unknown,
  fraudStatus: unknown,
): "PAID" | "PENDING" | "FAILED" | "EXPIRED" {
  if (transactionStatus === "capture") {
    return fraudStatus === "accept" ? "PAID" : "PENDING";
  }
  if (transactionStatus === "settlement") return "PAID";
  if (transactionStatus === "pending") return "PENDING";
  if (transactionStatus === "expire") return "EXPIRED";
  if (transactionStatus === "cancel" || transactionStatus === "deny" || transactionStatus === "failure") {
    return "FAILED";
  }
  return "PENDING";
}
