import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext, requireRole } from "@/modules/tenancy/context";
import {
  deleteDisplay,
  renameDisplay,
  rotateDisplayToken,
  setDisplayActive,
  setDisplayCounters,
} from "@/modules/display/display-service";

type RouteContext = { params: Promise<{ businessSlug: string; displayId: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    active: z.boolean().optional(),
    rotateToken: z.literal(true).optional(),
    counterIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.active !== undefined ||
      value.rotateToken ||
      value.counterIds !== undefined,
    { message: "Tidak ada perubahan yang dikirim." },
  );

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, displayId } = await params;
    const parsed = patchSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data display.", {
        name: "Nama display",
        active: "Status aktif",
      });
    }
    const context = await requireBusinessContext(businessSlug);

    // Rotation returns a fresh plaintext token exactly once; it is never stored.
    if (parsed.data.rotateToken) {
      const rotated = await rotateDisplayToken(context, displayId);
      return Response.json({ data: rotated });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      updates.name = (await renameDisplay(context, displayId, parsed.data.name)).name;
    }
    if (parsed.data.active !== undefined) {
      const result = await setDisplayActive(context, displayId, parsed.data.active);
      updates.active = result.active;
    }
    if (parsed.data.counterIds !== undefined) {
      const result = await setDisplayCounters(context, displayId, parsed.data.counterIds);
      updates.counterIds = result.counterIds;
    }
    return Response.json({ data: { id: displayId, ...updates } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, displayId } = await params;
    const context = await requireBusinessContext(businessSlug);
    requireRole(context, ["SUPER_ADMIN"]);
    const result = await deleteDisplay(context, displayId);
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
