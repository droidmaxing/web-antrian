import { requirePlatformAdmin } from "@/modules/platform/access";
import { createPlatformPlan, listPlatformPlans, planSchema } from "@/modules/platform/platform-service";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";

const createSchema = planSchema;
export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await listPlatformPlans() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = createSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) throw validationAppError(parsed.error, "Periksa kembali data paket.");
    const plan = await createPlatformPlan(parsed.data);
    return Response.json({ data: plan, actorId: admin.id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
