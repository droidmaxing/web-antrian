import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, readJsonRequest } from "@/modules/shared/errors";
import { validationAppError } from "@/modules/shared/validation-error";
import { requireBusinessContext, requireRole } from "@/modules/tenancy/context";
import { createDisplay } from "@/modules/display/display-service";

type RouteContext = { params: Promise<{ businessSlug: string }> };

const createSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  counterIds: z.array(z.string().min(1)).default([]),
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const context = await requireBusinessContext(businessSlug);
    requireRole(context, ["SUPER_ADMIN"]);
    const displays = await prisma.display.findMany({
      where: {
        businessId: context.businessId,
        ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
      },
      select: {
        id: true,
        branchId: true,
        name: true,
        active: true,
        createdAt: true,
        counters: { select: { counterId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({
      data: displays.map((display) => ({
        id: display.id,
        branchId: display.branchId,
        name: display.name,
        active: display.active,
        createdAt: display.createdAt,
        counterIds: display.counters.map((row) => row.counterId),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { businessSlug } = await params;
    const parsed = createSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw validationAppError(parsed.error, "Periksa kembali data display.", {
        branchId: "Cabang",
        name: "Nama display",
      });
    }
    const context = await requireBusinessContext(businessSlug, parsed.data.branchId);
    const display = await createDisplay(
      context,
      parsed.data.branchId,
      parsed.data.name,
      parsed.data.counterIds,
    );

    return Response.json({ data: display }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
