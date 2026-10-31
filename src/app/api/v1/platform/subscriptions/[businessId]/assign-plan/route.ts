import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/modules/platform/access";
import { AppError, errorResponse, readJsonRequest } from "@/modules/shared/errors";

const assignPlanSchema = z.object({
  planId: z.string().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const admin = await requirePlatformAdmin();
    const { businessId } = await params;

    const parsed = assignPlanSchema.safeParse(await readJsonRequest(request));
    if (!parsed.success) {
      throw new AppError("Data tidak valid.", 400, "INVALID_INPUT");
    }
    const { planId } = parsed.data;

    const business =
      await prisma.business.findUnique({
        where: { id: businessId },
      });

    if (!business) {
      throw new AppError("Workspace tidak ditemukan.", 404, "BUSINESS_NOT_FOUND");
    }

    // Verify plan exists if provided
    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new AppError("Paket tidak ditemukan.", 404, "PLAN_NOT_FOUND");
      }
    }

    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      update: { planId: planId || null },
      create: {
        businessId,
        planId: planId || null,
      },
      include: { plan: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        businessId,
        actorUserId: admin.id,
        action: "ASSIGN_PLAN",
        targetType: "SUBSCRIPTION",
        targetId: subscription.id,
        metadata: { planId: planId || null },
      },
    });

    return Response.json(
      {
        data: {
          id: subscription.id,
          planId: subscription.planId,
          plan: subscription.plan,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
