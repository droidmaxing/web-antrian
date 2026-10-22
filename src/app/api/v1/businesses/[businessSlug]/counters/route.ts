import { z } from "zod";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { createCounter, listCounters } from "@/modules/catalog/catalog-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const createSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  code: z
    .string()
    .trim()
    .min(1)
    .max(6)
    .regex(/^[A-Z0-9]+$/, "Kode hanya boleh huruf kapital dan angka."),
  active: z.boolean().optional(),
  serviceIds: z.array(z.string().min(1)).min(1, "Pilih minimal satu layanan."),
});

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const branchId = new URL(request.url).searchParams.get("branchId");
    if (!branchId) throw new AppError("Cabang wajib dipilih.", 400, "INVALID_BRANCH");
    const context = await requireBusinessContext(businessSlug, branchId);
    const counters = await listCounters(context, branchId);
    return Response.json({ data: counters }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = createSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data loket.", {
        branchId: "Cabang",
        name: "Nama loket",
        code: "Kode loket",
        serviceIds: "Layanan loket",
      });
    }
    const context = await requireBusinessContext(businessSlug, parsed.data.branchId);
    const counter = await createCounter(context, parsed.data);
    return Response.json({ data: counter }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
