import { requirePlatformAdmin } from "@/modules/platform/access";
import { resetPlatformUserPassword } from "@/modules/platform/platform-service";
import { errorResponse } from "@/modules/shared/errors";

/** Reset sandi pengguna dari konsol Master Admin. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requirePlatformAdmin();
    const { userId } = await params;
    const result = await resetPlatformUserPassword(userId);
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
