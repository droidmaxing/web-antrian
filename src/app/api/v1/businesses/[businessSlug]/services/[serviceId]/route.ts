import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { deleteService, updateService } from "@/modules/catalog/catalog-service";

type RouteContext = { params: Promise<{ businessSlug: string; serviceId: string }> };

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Z0-9]+$/)
      .optional(),
    description: z.string().trim().max(500).nullable().optional(),
    averageMinutes: z.coerce.number().int().min(1).max(240).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada perubahan yang dikirim.",
  });

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, serviceId } = await params;
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data layanan.", {
        name: "Nama layanan",
        code: "Kode layanan",
        averageMinutes: "Estimasi durasi",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const service = await updateService(context, serviceId, parsed.data);
    return Response.json({ data: service });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, serviceId } = await params;
    const context = await requireBusinessContext(businessSlug);
    const result = await deleteService(context, serviceId);
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
