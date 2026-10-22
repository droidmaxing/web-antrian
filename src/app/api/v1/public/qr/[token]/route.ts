import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";
import {
  getQrConfiguration,
  issuePublicQueue,
} from "@/modules/queue/application/public-queue";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    const config = await getQrConfiguration(token, request);
    return Response.json({ data: config }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

const issueSchema = z.object({
  serviceId: z.string().min(1).max(64),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(8).max(24).optional(),
});

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    const parsed = issueSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data Anda.", {
        serviceId: "Layanan",
        customerName: "Nama Anda",
        customerPhone: "Nomor WhatsApp",
      });
    }
    // A QR poster is public, so anyone can burn ticket numbers; cap issuance
    // per IP address before touching the database.
    await enforceRateLimit(`qr-issue:${token}:${clientAddress(request)}`, 20, 60);
    const result = await issuePublicQueue(token, request, parsed.data);
    return Response.json(
      {
        data: {
          ticketNumber: result.queue.ticketNumber,
          status: result.queue.status,
          issuedAt: result.queue.issuedAt,
          estimateMinutes: result.estimateMinutes,
          statusUrl: `/q/status/${result.receiptToken}`,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
