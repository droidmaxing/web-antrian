import { z } from "zod";
import { requirePlatformAdmin } from "@/modules/platform/access";
import { extendSubscriptionPeriod } from "@/modules/platform/platform-service";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";

const inputSchema = z.object({
  months: z.number().int().min(1).max(60),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { businessId } = await params;
    const parsed = inputSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw new AppError(
        "Bulan harus angka antara 1-60.",
        400,
        "INVALID_INPUT"
      );
    }
    const result = await extendSubscriptionPeriod(businessId, parsed.data, admin.id);
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
