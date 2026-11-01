import { AppError } from "@/modules/shared/errors";
import { readMidtransEnabled, readMidtransMode, readMidtransServerKey } from "@/modules/billing/midtrans-settings";

export type MidtransConfig = { serverKey: string; production: boolean };

/**
 * Credentials are stored encrypted when configured from the Master Admin
 * console. The environment remains a compatibility fallback; each mode has its
 * own key slot, so switching sandbox ↔ production never loses the other key.
 * The enable flag is deliberately NOT checked here: a notification that arrives
 * after the switch was turned off still has to be verified and recorded.
 */
export async function midtransConfig(): Promise<MidtransConfig | null> {
  const mode = await readMidtransMode();
  const serverKey = (await readMidtransServerKey(mode))?.trim();
  if (!serverKey) return null;
  return { serverKey, production: mode === "production" };
}

/**
 * Kunci untuk memverifikasi notifikasi webhook: mode aktif dulu, lalu mode lain.
 * Pembayaran yang dibuat sebelum mode diganti tetap harus bisa diselesaikan.
 */
export async function midtransVerificationKeys(): Promise<string[]> {
  const mode = await readMidtransMode();
  const keys = await Promise.all([
    readMidtransServerKey(mode),
    readMidtransServerKey(mode === "sandbox" ? "production" : "sandbox"),
  ]);
  return keys.flatMap((key) => (key ? [key] : []));
}

export function midtransSnapUrl(production: boolean) {
  return production
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

export type SnapInput = {
  orderId: string;
  amount: number;
  itemName: string;
  customerName: string;
  customerEmail: string;
};

export type SnapResult = { token: string; redirectUrl: string };

export async function createSnapTransaction(input: SnapInput): Promise<SnapResult> {
  if (!(await readMidtransEnabled())) {
    throw new AppError(
      "Pembayaran online sedang dinonaktifkan oleh administrator platform.",
      503,
      "BILLING_DISABLED",
    );
  }
  const config = await midtransConfig();
  if (!config) {
    throw new AppError(
      "Pembayaran belum dikonfigurasi. Hubungi administrator platform.",
      503,
      "BILLING_NOT_CONFIGURED",
    );
  }
  const response = await fetch(midtransSnapUrl(config.production), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${config.serverKey}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.amount },
      item_details: [{ id: input.orderId, name: input.itemName, price: input.amount, quantity: 1 }],
      customer_details: { first_name: input.customerName, email: input.customerEmail },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as
    | { token?: string; redirect_url?: string; error_messages?: string[] }
    | null;
  if (!response.ok || !body?.token) {
    // Gateway messages can echo request data; keep them out of the response.
    console.error("Midtrans Snap request failed", response.status, body?.error_messages);
    throw new AppError("Gagal memulai pembayaran. Coba lagi sebentar lagi.", 502, "PAYMENT_GATEWAY_ERROR");
  }
  return { token: body.token, redirectUrl: body.redirect_url ?? "" };
}
