import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { deleteCustomer, updateCustomer } from "@/modules/customer/customer-service";

type RouteContext = { params: Promise<{ businessSlug: string; customerId: string }> };

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    email: z.string().trim().max(120).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada perubahan yang dikirim.",
  });

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, customerId } = await params;
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data pelanggan.", {
        name: "Nama pelanggan",
        phone: "Nomor telepon",
        email: "Email",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const customer = await updateCustomer(context, customerId, parsed.data);
    return Response.json({ data: customer });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug, customerId } = await params;
    const context = await requireBusinessContext(businessSlug);
    const result = await deleteCustomer(context, customerId);
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
