import { requirePlatformAdmin } from "@/modules/platform/access";
import { listPlatformBusinesses, setBusinessActive } from "@/modules/platform/platform-service";
import { errorResponse, readJsonRequest, AppError } from "@/modules/shared/errors";
import { z } from "zod";

const updateSchema = z.object({ businessId: z.string().min(1).max(191), active: z.boolean() });
export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await listPlatformBusinesses() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    await requirePlatformAdmin();
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) throw new AppError("Data workspace tidak valid.", 400, "INVALID_INPUT");
    return Response.json({ data: await setBusinessActive(parsed.data.businessId, parsed.data.active) });
  } catch (error) { return errorResponse(error); }
}
