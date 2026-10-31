import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/modules/shared/errors";
import { requireBusinessContext, requireRole } from "@/modules/tenancy/context";
import { getSubscriptionView, listPayments } from "@/modules/billing/subscription-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const context = await requireBusinessContext(businessSlug, undefined, { allowInactiveSubscription: true });
    requireRole(context, ["OWNER"]);
    const [subscription, payments, plans] = await Promise.all([
      getSubscriptionView(context.businessId),
      listPayments(context.businessId),
      prisma.plan.findMany({ where: { active: true }, orderBy: { monthlyPrice: "asc" }, select: { id: true, code: true, name: true, description: true, monthlyPrice: true, yearlyPrice: true } }),
    ]);
    return Response.json({ data: { subscription, payments, plans } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
