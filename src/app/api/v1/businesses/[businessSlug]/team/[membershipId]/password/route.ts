import { errorResponse } from "@/modules/shared/errors";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { resetMemberPassword } from "@/modules/tenancy/team-service";

type RouteContext = {
  params: Promise<{ businessSlug: string; membershipId: string }>;
};

/** Reset sandi anggota tim: sistem yang membuat sandi sementara. */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, membershipId } = await params;
    const context = await requireBusinessContext(businessSlug);
    const result = await resetMemberPassword(context, membershipId);
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
