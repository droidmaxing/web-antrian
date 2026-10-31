import { z } from "zod";
import { midtransConfig } from "@/modules/billing/midtrans";
import { verifyMidtransSignature } from "@/modules/billing/billing-domain";
import { applyMidtransNotification } from "@/modules/billing/subscription-service";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { enforceRateLimit } from "@/modules/shared/rate-limit";

const notificationSchema = z.object({
  order_id: z.string().min(1).max(128),
  status_code: z.string().regex(/^\d{1,4}$/),
  gross_amount: z.union([z.string(), z.number()]),
  signature_key: z.string().length(128),
  transaction_status: z.string().min(1).max(32),
  fraud_status: z.string().max(32).optional(),
  transaction_id: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  try {
    const address =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    await enforceRateLimit(`webhook:midtrans:${address}`, 100, 60);

    const config = await midtransConfig();
    if (!config) throw new AppError("Webhook pembayaran belum dikonfigurasi.", 503, "BILLING_NOT_CONFIGURED");
    const parsed = notificationSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) throw new AppError("Notifikasi pembayaran tidak valid.", 400, "INVALID_NOTIFICATION");
    const notification = parsed.data;
    const grossAmount = String(notification.gross_amount);
    if (!verifyMidtransSignature(notification.order_id, notification.status_code, grossAmount, config.serverKey, notification.signature_key)) {
      throw new AppError("Tanda tangan notifikasi tidak valid.", 401, "INVALID_SIGNATURE");
    }
    const result = await applyMidtransNotification({ ...notification, gross_amount: grossAmount });
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
