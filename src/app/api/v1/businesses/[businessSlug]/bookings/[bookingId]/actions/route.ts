import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireFeature } from "@/modules/feature/feature-gate";
import { transitionBooking } from "@/modules/booking/application/booking-service";
import { requireBusinessContext } from "@/modules/tenancy/context";

type RouteContext = {
  params: Promise<{ businessSlug: string; bookingId: string }>;
};
const schema = z.object({ action: z.enum(["confirm", "cancel", "check-in", "no-show"]) });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, bookingId } = await params;
    const parsed = schema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Pilih aksi booking yang tersedia.", {
        action: "Aksi booking",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    await requireFeature(context.businessId, "BOOKING");
    const result = await transitionBooking(context, bookingId, parsed.data.action);
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
