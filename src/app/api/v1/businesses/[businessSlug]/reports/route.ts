import { AppError, errorResponse } from "@/modules/shared/errors";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { getReport, listAuditTrail } from "@/modules/report/report-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const include = url.searchParams.get("include");

    if (!branchId) throw new AppError("Cabang wajib dipilih.", 400, "INVALID_BRANCH");

    const context = await requireBusinessContext(businessSlug, branchId);
    if (include === "audit") {
      const logs = await listAuditTrail(context, Number(url.searchParams.get("limit") ?? 50));
      return Response.json({ data: { logs } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!from || !to) {
      throw new AppError(
        "Tanggal awal dan akhir wajib diisi.",
        400,
        "INVALID_RANGE",
      );
    }
    const report = await getReport(context, { branchId, from, to });
    return Response.json({ data: report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
