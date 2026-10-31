import { z } from "zod";
import { BillingCycle } from "@prisma/client";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { startCheckout } from "@/modules/billing/subscription-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };
const checkoutSchema = z.object({ planId: z.string().min(1).max(191), cycle: z.enum(BillingCycle) });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = checkoutSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) throw validationAppError(parsed.error, "Pilih paket dan periode pembayaran.");
    const context = await requireBusinessContext(businessSlug, undefined, { allowInactiveSubscription: true });
    const data = await startCheckout(context, parsed.data.planId, parsed.data.cycle);
    return Response.json({ data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
