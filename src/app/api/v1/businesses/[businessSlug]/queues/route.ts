import { z } from "zod";
import { errorResponse, AppError, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { callNext, listQueues } from "@/modules/queue/application/queue-service";

const callNextSchema = z.object({
  branchId: z.string().min(1),
  counterId: z.string().min(1),
  serviceId: z.string().min(1).optional(),
});

type RouteContext = { params: Promise<{ businessSlug: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const url = new URL(request.url);
    const branchId = z.string().min(1).safeParse(url.searchParams.get("branchId"));
    // Autentikasi/tenant dulu: permintaan tanpa sesi harus 401, bukan bocor 400 validasi.
    const context = await requireBusinessContext(businessSlug, branchId.data);
    if (!branchId.success) throw new AppError("Cabang wajib dipilih.", 400, "INVALID_BRANCH");

    const queues = await listQueues(context, branchId.data);
    return Response.json({ data: queues });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = callNextSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data pemanggilan antrean.", {
        branchId: "Cabang",
        counterId: "Loket",
        serviceId: "Layanan",
      });
    }
    const context = await requireBusinessContext(businessSlug, parsed.data.branchId);
    const queue = await callNext(context, parsed.data);
    return Response.json({ data: queue }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
