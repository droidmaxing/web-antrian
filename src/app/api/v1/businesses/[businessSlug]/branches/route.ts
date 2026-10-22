import { z } from "zod";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext } from "@/modules/tenancy/context";
import { createBranch, listBranches, updateBranch } from "@/modules/tenancy/branch-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const hoursSchema = z.array(
  z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closed: z.boolean().optional(),
  }),
);

const branchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(3).max(64).optional(),
  ticketPrefix: z.string().trim().min(1).max(4).optional(),
  resetDaily: z.boolean().optional(),
  estimateBuffer: z.coerce.number().int().min(0).max(120).optional(),
  operatingHours: hoursSchema.optional(),
});

const updateSchema = branchSchema.partial().extend({ active: z.boolean().optional() });

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const context = await requireBusinessContext(businessSlug);
    const branches = await listBranches(context);
    return Response.json({ data: branches }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = branchSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data cabang.", {
        name: "Nama cabang",
        timezone: "Zona waktu",
        operatingHours: "Jam operasional",
      });
    }
    const context = await requireBusinessContext(businessSlug);
    const branch = await createBranch(context, parsed.data);
    return Response.json({ data: branch }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const parsed = updateSchema.safeParse(await readJsonRequest(request));
    if (!branchId || !parsed.success) {
      throw validationAppError(
        parsed.success
          ? new z.ZodError([
              {
                code: "custom",
                message: "Cabang wajib dipilih.",
                path: ["branchId"],
              },
            ])
          : parsed.error,
        "Periksa kembali data cabang.",
        { name: "Nama cabang", branchId: "Cabang", operatingHours: "Jam operasional" },
      );
    }
    const context = await requireBusinessContext(businessSlug, branchId);
    const branch = await updateBranch(context, branchId, parsed.data);
    return Response.json({ data: branch });
  } catch (error) {
    return errorResponse(error);
  }
}
