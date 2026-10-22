import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { removeMember, updateMember } from "@/modules/tenancy/team-service";

type RouteContext = {
  params: Promise<{ businessSlug: string; membershipId: string }>;
};

const updateSchema = z
  .object({
    role: z.enum(["OWNER", "SUPER_ADMIN", "ADMIN"]).optional(),
    branchIds: z.array(z.string().min(1)).optional(),
    counterIds: z.array(z.string().min(1)).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada perubahan yang dikirim.",
  });

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, membershipId } = await params;
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data anggota tim.", {
        role: "Peran",
        branchIds: "Cabang",
        counterIds: "Loket",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const member = await updateMember(context, membershipId, parsed.data);
    return Response.json({ data: member });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, membershipId } = await params;
    const context = await requireBusinessContext(businessSlug);
    const result = await removeMember(context, membershipId);
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
