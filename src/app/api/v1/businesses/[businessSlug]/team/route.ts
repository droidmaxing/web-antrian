import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { inviteMember, listTeam } from "@/modules/tenancy/team-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  role: z.enum(["OWNER", "SUPER_ADMIN", "ADMIN"]),
  branchIds: z.array(z.string().min(1)).default([]),
  counterIds: z.array(z.string().min(1)).default([]),
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const context = await requireBusinessContext(businessSlug);
    const members = await listTeam(context);
    return Response.json({ data: members }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = inviteSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data anggota tim.", {
        name: "Nama",
        email: "Email",
        role: "Peran",
        branchIds: "Cabang",
        counterIds: "Loket",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const member = await inviteMember(context, parsed.data);
    return Response.json(
      { data: member },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
