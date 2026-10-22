import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { createCustomer, listCustomers } from "@/modules/customer/customer-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const createSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
});

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const query = new URL(request.url).searchParams.get("query") ?? undefined;
    const context = await requireBusinessContext(businessSlug);
    const customers = await listCustomers(context, { query });
    return Response.json({ data: customers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = createSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data pelanggan.", {
        name: "Nama pelanggan",
        phone: "Nomor telepon",
        email: "Email",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const customer = await createCustomer(context, parsed.data);
    return Response.json({ data: customer }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
