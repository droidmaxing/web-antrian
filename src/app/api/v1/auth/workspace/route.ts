import { auth } from "@/lib/auth";
import {
  createWorkspaceForUser,
  workspaceSchema,
} from "@/modules/tenancy/registration-service";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { enforceRateLimit } from "@/modules/shared/rate-limit";
import { validationAppError } from "@/modules/shared/validation-error";

/**
 * Workspace for an account that already signed in (Google, or a user whose
 * membership was removed). The account stays untouched — only the workspace,
 * owner membership, first branch, and trial are created.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AppError("Masuk terlebih dahulu untuk membuat workspace.", 401, "UNAUTHENTICATED");
    }
    await enforceRateLimit(`workspace:${session.user.id}`, 5, 60 * 60);
    const parsed = workspaceSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali nama bisnis.", {
        companyName: "Nama bisnis",
      });
    }
    const data = await createWorkspaceForUser(session.user.id, parsed.data.companyName);
    return Response.json({ data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
