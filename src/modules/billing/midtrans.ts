import { AppError } from "@/modules/shared/errors";
import { readMidtransServerKey, readMidtransMode } from "@/modules/billing/midtrans-settings";

export type MidtransConfig = { serverKey: string; production: boolean };

/**
 * Credentials are stored encrypted when configured from the Master Admin
 * console. The environment remains a compatibility fallback; development uses
 * the Midtrans sandbox unless explicitly configured otherwise.
 */
export async function midtransConfig(): Promise<MidtransConfig | null> {
  const serverKey = (await readMidtransServerKey())?.trim();
  if (!serverKey) return null;
  const production = await readMidtransMode() === "production";
  return { serverKey, production };
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
