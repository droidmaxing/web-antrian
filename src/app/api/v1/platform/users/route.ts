import { requirePlatformAdmin } from "@/modules/platform/access";
import {
  listPlatformUsers,
  platformListQuerySchema,
} from "@/modules/platform/platform-service";
import { AppError, errorResponse } from "@/modules/shared/errors";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const searchParams = new URL(request.url).searchParams;
    const parsed = platformListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) throw new AppError("Parameter halaman tidak valid.", 400, "INVALID_INPUT");
    return Response.json({ data: await listPlatformUsers(parsed.data) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
