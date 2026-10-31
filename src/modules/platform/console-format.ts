import type { Tone } from "@/components/platform-ui";

/** Pemformatan bersama untuk halaman konsol platform. */
export const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const tanggal = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export const dateLabel = (value: Date | null | undefined) => (value ? tanggal.format(value) : "—");

export const CYCLE_LABEL: Record<string, string> = { MONTHLY: "Bulanan", YEARLY: "Tahunan" };
export const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  PAID: "Dibayar",
  EXPIRED: "Kedaluwarsa",
  FAILED: "Gagal",
};

export function subscriptionTone(status: string): Tone {
  return status === "ACTIVE" ? "ok" : status === "TRIAL" ? "warn" : "off";
}

export function paymentTone(status: string): Tone {
  return status === "PAID" ? "ok" : status === "PENDING" ? "warn" : "off";
}

/** Akhir periode efektif: periode berbayar, atau akhir masa uji coba. */
export function periodEnd(subscription: {
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
}): Date | null {
  return subscription.currentPeriodEnd ?? subscription.trialEndsAt;
}
