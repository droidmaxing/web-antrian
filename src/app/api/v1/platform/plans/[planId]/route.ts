import { z } from "zod";
import { requirePlatformAdmin } from "@/modules/platform/access";
import { planSchema, updatePlatformPlan } from "@/modules/platform/platform-service";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";

const paramsSchema = z.object({ planId: z.string().min(1).max(191) });
type RouteContext = { params: Promise<{ planId: string }> };
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requirePlatformAdmin();
    const parsedParams = paramsSchema.safeParse(await params);
    const parsed = planSchema.safeParse(await readJsonRequest(request));
    if (!parsedParams.success) throw validationAppError(parsedParams.error, "Workspace tidak valid.");
    if (!parsed.success) throw validationAppError(parsed.error, "Periksa kembali data paket.");
    return Response.json({ data: await updatePlatformPlan(parsedParams.data.planId, parsed.data) });
  } catch (error) { return errorResponse(error); }
}
