import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { deleteCounter, updateCounter } from "@/modules/catalog/catalog-service";

type RouteContext = { params: Promise<{ businessSlug: string; counterId: string }> };

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(6)
      .regex(/^[A-Z0-9]+$/)
      .optional(),
    active: z.boolean().optional(),
    serviceIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada perubahan yang dikirim.",
  });

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, counterId } = await params;
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data loket.", {
        name: "Nama loket",
        code: "Kode loket",
        serviceIds: "Layanan loket",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const counter = await updateCounter(context, counterId, parsed.data);
    return Response.json({ data: counter });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, counterId } = await params;
    const context = await requireBusinessContext(businessSlug);
    const result = await deleteCounter(context, counterId);
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
